-- =============================================================================
-- Cola durable de los avisos del embudo + reserva ATÓMICA del envío
-- =============================================================================
-- POR QUÉ EXISTE
--
-- `POST /api/funnel/submit` encadenaba 25 idas y vueltas de red esperadas una
-- tras otra (contacto, deal, tarea, email, Mailchimp, stitching, Meta CAPI).
-- El 2026-08-08 el POST a Resend colgó 34,47 s y arrastró el request a ~38 s:
-- el gateway devolvió una página HTML de error 504 y la persona vio "algo salió
-- mal" a pesar de que el lead SÍ había quedado en el CRM. El daño no es perder
-- el lead: es que se va creyendo que no se registró, nunca llega a la página de
-- gracias, y la conversión no se le reporta a Meta (los adsets optimizan por
-- CompleteRegistration).
--
-- La respuesta al visitante ahora afirma SOLO dos cosas —"te registramos" y "no
-- sos duplicado"— y para eso alcanzan 5 viajes, todos a Postgres y ninguno a un
-- tercero. Los cinco avisos se encolan acá y los ejecuta un worker aparte
-- (`lib/funnel/side-effects-worker.ts`, disparado por pg_cron).
--
-- 100% ADITIVA: no borra ni reescribe ninguna fila existente. La columna nueva
-- de `funnel_lead_submissions` nace con default 'complete', así que las filas
-- históricas —y cualquier código viejo que todavía inserte sin la columna—
-- siguen contando como conversiones igual que antes.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Estado del envío: la fila ahora se inserta AL PRINCIPIO, no al final.
-- -----------------------------------------------------------------------------
-- El rate-limit por IP y el dedup de 5 minutos leen esta tabla. Si la fila se
-- escribe al final (como hasta ahora), dos envíos simultáneos del mismo teléfono
-- no se ven entre sí y crean DOS deals. Por eso la fila se reserva primero, en
-- estado 'reserved', y recién pasa a 'complete' cuando el contacto y el deal ya
-- existen.
--
-- 'reserved' es un estado transitorio de segundos. Una reserva abandonada (el
-- proceso murió entre la reserva y el alta) queda huérfana: NO cuenta como
-- conversión —las métricas filtran por 'complete'— y deja de frenar duplicados
-- apenas pasa la ventana corta de "en vuelo" (ver `p_inflight_seconds`).
ALTER TABLE public.funnel_lead_submissions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.funnel_lead_submissions'::regclass
       AND conname  = 'funnel_lead_submissions_status_check'
  ) THEN
    ALTER TABLE public.funnel_lead_submissions
      ADD CONSTRAINT funnel_lead_submissions_status_check
      CHECK (status IN ('reserved', 'complete'));
  END IF;
END $$;

COMMENT ON COLUMN public.funnel_lead_submissions.status IS
  'reserved = envío reservado (rate-limit/dedup ya resueltos, contacto y deal todavía no). complete = el lead existe en el CRM. Las métricas del embudo cuentan SOLO ''complete''.';


-- -----------------------------------------------------------------------------
-- 2) La cola de avisos.
-- -----------------------------------------------------------------------------
-- UNO por etapa, no un trabajo único: si Resend cuelga no tiene por qué
-- arrastrar al evento de Meta ni a la tarea de la coordinadora.
--
-- `unique (submission_id, kind)` es la idempotencia del encolado: se encola con
-- ON CONFLICT DO NOTHING, así que un reintento del mismo envío no duplica
-- trabajos (ni emails, ni eventos de conversión).
CREATE TABLE IF NOT EXISTS public.funnel_lead_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES public.funnel_lead_submissions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('coordinator_task','notify','mailchimp','anon_stitch','capi')),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed','skipped')),
  attempts        INT  NOT NULL DEFAULT 0,
  max_attempts    INT  NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, kind)
);

-- El worker solo busca trabajo vivo. El índice parcial mantiene chico el índice
-- aunque la tabla acumule miles de trabajos ya terminados.
CREATE INDEX IF NOT EXISTS idx_funnel_lead_jobs_pendientes
  ON public.funnel_lead_jobs (next_attempt_at)
  WHERE status IN ('pending','running');

-- Sin policies → solo el service role entra. El payload de `capi` incluye la IP
-- y el user-agent del visitante (los pide Meta para el match); no tiene por qué
-- ser legible desde el navegador de nadie.
ALTER TABLE public.funnel_lead_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.funnel_lead_jobs IS
  'Cola durable de los avisos diferidos de un envío del embudo (tarea de coordinación, email, Mailchimp, stitching de sesión anónima, evento de conversión a Meta). La procesa lib/funnel/side-effects-worker.ts vía pg_cron → POST /api/cron/funnel-side-effects.';


-- -----------------------------------------------------------------------------
-- 3) Reserva ATÓMICA del envío: rate-limit + dedup + alta, en una sola operación.
-- -----------------------------------------------------------------------------
-- EL PROBLEMA QUE RESUELVE: "leer y después escribir" no es atómico. Dos POST
-- simultáneos del mismo teléfono son dos transacciones que, bajo READ COMMITTED,
-- no ven la fila todavía sin confirmar de la otra: las dos leen "no hay
-- duplicado" y las dos crean un deal. Lo mismo con el rate-limit por IP.
--
-- CÓMO SE SERIALIZA: antes de mirar nada, la función toma un candado por cada
-- identidad del envío (IP, email, teléfono). Los candados son de transacción, así
-- que se sueltan solos al terminar —incluso si la función explota— y el segundo
-- request espera al primero, ve su fila ya confirmada y responde 'duplicado'.
-- Se toman ORDENADOS y sin repetir: dos requests que compartan dos identidades
-- los piden en el mismo orden, así que no puede haber abrazo mortal.
CREATE OR REPLACE FUNCTION public.reservar_envio_embudo(
  p_funnel                TEXT,
  p_ip_hash               TEXT,
  p_email                 TEXT,
  p_phone                 TEXT,
  p_event_id              TEXT,
  p_rate_max              INT,
  p_rate_window_seconds   INT,
  p_dedup_window_seconds  INT,
  p_inflight_seconds      INT
)
RETURNS TABLE (resultado TEXT, submission_id UUID, contact_id UUID)
LANGUAGE plpgsql
-- SECURITY DEFINER: `funnel_lead_submissions` tiene RLS sin ninguna policy. El
-- backend entra con el service role (que la puentea igual), pero dejarlo
-- explícito evita que un cambio futuro de RLS convierta la reserva en un error
-- permanente — y un error acá es un lead perdido.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email        TEXT := nullif(btrim(coalesce(p_email, '')), '');
  v_phone        TEXT := nullif(btrim(coalesce(p_phone, '')), '');
  v_ip           TEXT := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_llaves       BIGINT[] := '{}';
  v_llave        BIGINT;
  v_envios       INT;
  v_dup_id       UUID;
  v_dup_contacto UUID;
  v_id           UUID;
BEGIN
  -- 3.1) Candados por identidad. La llave lleva prefijo para no chocar con
  --      candados de otra parte del sistema, y el email se normaliza (minúsculas)
  --      para que dos escrituras del mismo mail compartan candado.
  --
  --      La llave sale de los primeros 64 bits del md5 (el idioma habitual para
  --      convertir texto en la clave bigint que pide pg_advisory_xact_lock). Se
  --      usa md5 y no `hashtext`/`hashtextextended` porque esas son funciones
  --      internas sin documentar: si alguna vez dejaran de ser invocables, la
  --      migración fallaría y CADA envío del embudo devolvería un error.
  IF v_ip IS NOT NULL THEN
    v_llaves := v_llaves || ('x' || substr(md5('embudo:ip:' || v_ip), 1, 16))::BIT(64)::BIGINT;
  END IF;
  IF v_email IS NOT NULL THEN
    v_llaves := v_llaves || ('x' || substr(md5('embudo:email:' || lower(v_email)), 1, 16))::BIT(64)::BIGINT;
  END IF;
  IF v_phone IS NOT NULL THEN
    v_llaves := v_llaves || ('x' || substr(md5('embudo:tel:' || v_phone), 1, 16))::BIT(64)::BIGINT;
  END IF;

  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}'::BIGINT[])
    INTO v_llaves
    FROM unnest(v_llaves) AS k;

  FOREACH v_llave IN ARRAY v_llaves LOOP
    PERFORM pg_advisory_xact_lock(v_llave);
  END LOOP;

  -- 3.2) Rate-limit por IP. Cuenta también las reservas en vuelo: un envío es un
  --      envío aunque todavía no haya terminado.
  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_envios
      FROM funnel_lead_submissions s
     WHERE s.ip_hash = v_ip
       AND s.created_at >= now() - make_interval(secs => p_rate_window_seconds);

    IF v_envios >= p_rate_max THEN
      RETURN QUERY SELECT 'rate_limited'::TEXT, NULL::UUID, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- 3.3) Dedup: primero por email, después por teléfono (mismo orden que tenía
  --      la ruta). Cuenta un envío ya completo dentro de la ventana de 5 minutos,
  --      o uno todavía en vuelo dentro de una ventana MUCHO más corta —una
  --      reserva abandonada no puede bloquear a la persona durante 5 minutos.
  IF v_email IS NOT NULL THEN
    SELECT s.id, s.contact_id INTO v_dup_id, v_dup_contacto
      FROM funnel_lead_submissions s
     WHERE s.email = v_email
       AND (
             (s.status = 'complete' AND s.created_at >= now() - make_interval(secs => p_dedup_window_seconds))
          OR (s.status = 'reserved' AND s.created_at >= now() - make_interval(secs => p_inflight_seconds))
           )
     ORDER BY s.created_at DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT 'duplicado'::TEXT, v_dup_id, v_dup_contacto;
      RETURN;
    END IF;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT s.id, s.contact_id INTO v_dup_id, v_dup_contacto
      FROM funnel_lead_submissions s
     WHERE s.phone = v_phone
       AND (
             (s.status = 'complete' AND s.created_at >= now() - make_interval(secs => p_dedup_window_seconds))
          OR (s.status = 'reserved' AND s.created_at >= now() - make_interval(secs => p_inflight_seconds))
           )
     ORDER BY s.created_at DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT 'duplicado'::TEXT, v_dup_id, v_dup_contacto;
      RETURN;
    END IF;
  END IF;

  -- 3.4) Reserva. A partir de acá cualquier otro request del mismo teléfono o
  --      mail ve esta fila y responde 'duplicado'.
  INSERT INTO funnel_lead_submissions (funnel, ip_hash, email, phone, event_id, status)
  VALUES (p_funnel, v_ip, v_email, v_phone, nullif(btrim(coalesce(p_event_id, '')), ''), 'reserved')
  RETURNING id INTO v_id;

  RETURN QUERY SELECT 'reservado'::TEXT, v_id, NULL::UUID;
END;
$$;

COMMENT ON FUNCTION public.reservar_envio_embudo(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT,INT,INT) IS
  'Resuelve rate-limit por IP, dedup por email/teléfono y alta de la fila del envío en UNA sola operación serializada por candados de transacción. Devuelve resultado = rate_limited | duplicado | reservado.';

REVOKE ALL ON FUNCTION public.reservar_envio_embudo(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT,INT,INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_envio_embudo(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT,INT,INT) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_envio_embudo(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT,INT,INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_envio_embudo(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT,INT,INT) TO service_role;


-- -----------------------------------------------------------------------------
-- 4) Cerrar la reserva y encolar los avisos — un solo viaje.
-- -----------------------------------------------------------------------------
-- Va junto a propósito: si el envío quedara 'complete' sin sus trabajos, nadie
-- se enteraría del lead; y si los trabajos existieran sin el envío cerrado, la
-- conversión no contaría. Una sola sentencia por transacción, las dos o ninguna.
CREATE OR REPLACE FUNCTION public.completar_envio_embudo(
  p_submission_id UUID,
  p_contact_id    UUID,
  p_deal_id       UUID,
  p_trabajos      JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encolados INT := 0;
BEGIN
  UPDATE funnel_lead_submissions
     SET contact_id = p_contact_id,
         deal_id    = p_deal_id,
         status     = 'complete'
   WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe la reserva %', p_submission_id;
  END IF;

  -- ON CONFLICT DO NOTHING sobre (submission_id, kind): encolar dos veces el
  -- mismo envío no duplica avisos. Es lo que hace seguro reintentar esta llamada.
  INSERT INTO funnel_lead_jobs (submission_id, kind, payload)
  SELECT p_submission_id,
         t ->> 'kind',
         coalesce(t -> 'payload', '{}'::jsonb)
    FROM jsonb_array_elements(coalesce(p_trabajos, '[]'::jsonb)) AS t
  ON CONFLICT (submission_id, kind) DO NOTHING;

  GET DIAGNOSTICS v_encolados = ROW_COUNT;
  RETURN v_encolados;
END;
$$;

COMMENT ON FUNCTION public.completar_envio_embudo(UUID,UUID,UUID,JSONB) IS
  'Cierra la reserva del envío (status complete + contacto + deal) y encola sus avisos en funnel_lead_jobs. Idempotente: reintentarla no duplica trabajos. Devuelve cuántos trabajos encoló.';

REVOKE ALL ON FUNCTION public.completar_envio_embudo(UUID,UUID,UUID,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.completar_envio_embudo(UUID,UUID,UUID,JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.completar_envio_embudo(UUID,UUID,UUID,JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.completar_envio_embudo(UUID,UUID,UUID,JSONB) TO service_role;


-- =============================================================================
-- Verificación después de aplicar (la hace scripts/apply-funnel-jobs-pg.ts):
--   1. La columna `status` existe y TODAS las filas viejas quedaron 'complete'.
--   2. La tabla `funnel_lead_jobs` existe, con RLS y con la UNIQUE del encolado.
--   3. Las dos funciones existen y son SECURITY DEFINER.
--   4. No cambió la cantidad de filas de funnel_lead_submissions, deals ni contacts.
-- =============================================================================
