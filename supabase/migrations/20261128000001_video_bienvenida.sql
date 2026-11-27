-- Video de bienvenida de tasación (change OpenSpec `tasacion-video-bienvenida`, design.md D2,
-- D3b y D6). ADITIVA: una tabla nueva y cinco funciones nuevas. No toca tablas, triggers ni
-- funciones existentes.
--
-- Se aplica y VERIFICA con `scripts/apply-video-bienvenida-pg.ts` (pooler de sesión contra
-- mncsnastmcjdjxrehdep). El script vuelve a correr este archivo entero: todo es idempotente
-- (IF NOT EXISTS, CREATE OR REPLACE, DROP + ADD de los CHECK). Un arreglo posterior de un
-- CHECK, una policy o un grant se hace TAMBIÉN acá, o volver a verificar lo revierte.

-- ── Tabla ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_bienvenida_enlaces (
  codigo            text PRIMARY KEY,
  contact_id        uuid NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id           uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  nombre            text,
  origen            text NOT NULL,
  creado_por        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  enviado_at        timestamptz,
  wamid             text,
  envio_fallido_at  timestamptz,
  respaldo_at       timestamptz,
  primera_apertura  timestamptz,
  ultima_apertura   timestamptz,
  aperturas         integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.video_bienvenida_enlaces IS
  'Enlace personal (inmodf.com.ar/t/<codigo>) al video de bienvenida de tasación: uno por contacto. '
  'Lo que la persona mira se guarda en video_view_state con anon_id = ''bv:'' || codigo.';

-- El alfabeto es el de lead_access_tokens (sin I, O, l, 0, 1). La misma regex vive en
-- lib/video-bienvenida/codigo.ts y su test recorre el alfabeto contra ella.
ALTER TABLE public.video_bienvenida_enlaces DROP CONSTRAINT IF EXISTS video_bienvenida_enlaces_codigo_check;
ALTER TABLE public.video_bienvenida_enlaces ADD CONSTRAINT video_bienvenida_enlaces_codigo_check
  CHECK (codigo ~ '^[A-HJ-NP-Za-km-z2-9]{10}$');
ALTER TABLE public.video_bienvenida_enlaces DROP CONSTRAINT IF EXISTS video_bienvenida_enlaces_origen_check;
ALTER TABLE public.video_bienvenida_enlaces ADD CONSTRAINT video_bienvenida_enlaces_origen_check
  CHECK (origen IN ('whatsapp', 'manual'));
ALTER TABLE public.video_bienvenida_enlaces DROP CONSTRAINT IF EXISTS video_bienvenida_enlaces_aperturas_check;
ALTER TABLE public.video_bienvenida_enlaces ADD CONSTRAINT video_bienvenida_enlaces_aperturas_check
  CHECK (aperturas >= 0);

-- El proceso del ÚLTIMO envío con video (una persona que se registra dos veces tiene dos): el
-- respaldo tardío vuelve a encolar el trabajo de WhatsApp de ESE proceso.
ALTER TABLE public.video_bienvenida_enlaces
  ADD COLUMN IF NOT EXISTS deal_envio uuid REFERENCES public.deals(id) ON DELETE SET NULL;

-- El aviso tardío de Meta llega con el wamid: se busca por ahí.
CREATE INDEX IF NOT EXISTS video_bienvenida_enlaces_wamid_idx
  ON public.video_bienvenida_enlaces (wamid) WHERE wamid IS NOT NULL;

-- ── RLS: lectura para operaciones; escritura solo por el servidor ──────────────────────
ALTER TABLE public.video_bienvenida_enlaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS video_bienvenida_enlaces_select_ops ON public.video_bienvenida_enlaces;
CREATE POLICY video_bienvenida_enlaces_select_ops ON public.video_bienvenida_enlaces
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- ── Crear o reusar el enlace (y unir 'bv:<codigo>' al contacto) ───────────────────────
-- Siempre llama a link_anon_to_contact, que es idempotente: un enlace viejo al que le haya
-- fallado la unión se repara solo la próxima vez. Después verifica que la unión quedó con
-- ESTE contacto (link_anon_to_contact nunca pisa una unión previa).
CREATE OR REPLACE FUNCTION public.video_bienvenida_obtener_o_crear(
  p_contact    uuid,
  p_deal       uuid,
  p_nombre     text,
  p_origen     text,
  p_creado_por uuid,
  p_codigo     text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
  v_unido  uuid;
BEGIN
  INSERT INTO public.video_bienvenida_enlaces (codigo, contact_id, deal_id, nombre, origen, creado_por)
  VALUES (p_codigo, p_contact, p_deal, p_nombre, p_origen, p_creado_por)
  ON CONFLICT (contact_id) DO NOTHING;

  SELECT codigo INTO v_codigo FROM public.video_bienvenida_enlaces WHERE contact_id = p_contact;

  PERFORM public.link_anon_to_contact('bv:' || v_codigo, p_contact);
  SELECT contact_id INTO v_unido FROM public.anon_identity WHERE anon_id = 'bv:' || v_codigo;
  IF v_unido IS DISTINCT FROM p_contact THEN
    RAISE WARNING 'video_bienvenida: bv:% unido a % y no a %', v_codigo, v_unido, p_contact;
  END IF;

  RETURN v_codigo;
END;
$$;

-- ── Apertura (la llama la ruta pública con el rol de servicio) ───────────────────────
CREATE OR REPLACE FUNCTION public.video_bienvenida_registrar_apertura(p_codigo text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE public.video_bienvenida_enlaces
       SET aperturas        = aperturas + 1,
           primera_apertura = coalesce(primera_apertura, now()),
           ultima_apertura  = now()
     WHERE codigo = p_codigo
     RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- ── Marca de enviado: cuando Meta aceptó la plantilla con video ──────────────────────
-- Un mensaje NUEVO (otro wamid: la persona se volvió a registrar) reinicia el respaldo: si Meta
-- frena también ese, tiene que volver a salir el mensaje sin video (auditoría de código, hallazgo 1).
-- La firma cambió (p_deal): DROP antes, porque CREATE OR REPLACE no cambia argumentos.
DROP FUNCTION IF EXISTS public.video_bienvenida_marcar_enviado(text, text);
CREATE OR REPLACE FUNCTION public.video_bienvenida_marcar_enviado(p_codigo text, p_wamid text, p_deal uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.video_bienvenida_enlaces
     SET enviado_at       = coalesce(enviado_at, now()),
         respaldo_at      = CASE WHEN p_wamid IS DISTINCT FROM wamid THEN NULL ELSE respaldo_at END,
         envio_fallido_at = CASE WHEN p_wamid IS DISTINCT FROM wamid THEN NULL ELSE envio_fallido_at END,
         wamid            = coalesce(p_wamid, wamid),
         deal_envio       = coalesce(p_deal, deal_envio)
   WHERE codigo = p_codigo;
$$;

-- ── Respaldo tardío: una sola vez por mensaje fallido ────────────────────────────────
-- Atómica: el UPDATE con respaldo_at IS NULL solo devuelve fila la primera vez. Un aviso
-- repetido de Meta (o dos webhooks en paralelo) no manda un segundo mensaje.
--
-- Y en la MISMA transacción vuelve a encolar el trabajo `whatsapp` de ese proceso, marcado
-- `sinVideo`, con el payload rearmado (el worker lo vacía al terminar). Así el mensaje sin video
-- sale con los reintentos de la cola y el webhook no llama a Meta (auditoría de código, hallazgo 2).
-- `encolado = false` (sin proceso, o el trabajo está corriendo): el servidor manda en el momento.
DROP FUNCTION IF EXISTS public.video_bienvenida_tomar_respaldo(text);
DROP FUNCTION IF EXISTS public.video_bienvenida_tomar_respaldo(text, text);
CREATE OR REPLACE FUNCTION public.video_bienvenida_tomar_respaldo(p_wamid text, p_phone text)
RETURNS TABLE (contact_id uuid, nombre text, encolado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contacto uuid;
  v_nombre   text;
  v_deal     uuid;
  v_n        integer := 0;
BEGIN
  UPDATE public.video_bienvenida_enlaces e
     SET envio_fallido_at = now(),
         respaldo_at      = now()
   WHERE e.wamid = p_wamid
     AND e.respaldo_at IS NULL
  RETURNING e.contact_id, e.nombre, e.deal_envio INTO v_contacto, v_nombre, v_deal;

  IF v_contacto IS NULL THEN
    RETURN;
  END IF;

  IF v_deal IS NOT NULL AND p_phone IS NOT NULL THEN
    UPDATE public.funnel_lead_jobs j
       SET payload = jsonb_build_object(
             'funnel', 'tasacion', 'dealId', v_deal, 'contactId', v_contacto,
             'nombre', coalesce(nullif(v_nombre, ''), split_part(ct.full_name, ' ', 1), ''),
             'phone', p_phone, 'sinVideo', true),
           status = 'pending', attempts = 0, next_attempt_at = now(),
           claimed_at = NULL, last_error = NULL, updated_at = now()
      FROM public.funnel_lead_submissions s, public.contacts ct
     WHERE j.submission_id = s.id
       AND s.deal_id = v_deal
       AND ct.id = v_contacto
       AND j.kind = 'whatsapp'
       AND j.status IN ('done', 'skipped', 'failed');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  contact_id := v_contacto;
  nombre := v_nombre;
  encolado := v_n > 0;
  RETURN NEXT;
END;
$$;

-- ── Lectura para la marca de la cartera: ids en el cuerpo ────────────────────────────
-- De las vistas del video, la más reciente (cuando el video editado reemplace al limpio, la
-- clave pasa de -v1 a -v2 y los tramos de dos videos distintos no se pueden mezclar).
CREATE OR REPLACE FUNCTION public.cartera_video_bienvenida(p_contactos uuid[])
RETURNS TABLE (
  contacto_id       uuid,
  enviado_at        timestamptz,
  envio_fallido_at  timestamptz,
  aperturas         integer,
  playback_started  boolean,
  watched_buckets   text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.contact_id,
         e.enviado_at,
         e.envio_fallido_at,
         e.aperturas,
         coalesce(v.playback_started, false),
         v.watched_buckets::text
    FROM public.video_bienvenida_enlaces e
    LEFT JOIN LATERAL (
      SELECT s.playback_started, s.watched_buckets
        FROM public.video_view_state s
       WHERE s.anon_id = 'bv:' || e.codigo
         AND s.video_key LIKE 'bienvenida-tasacion-%'
       ORDER BY s.updated_at DESC
       LIMIT 1
    ) v ON true
   WHERE e.contact_id = ANY (p_contactos);
$$;

-- ── Permisos: solo el servidor ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.video_bienvenida_obtener_o_crear(uuid, uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.video_bienvenida_registrar_apertura(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.video_bienvenida_marcar_enviado(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.video_bienvenida_tomar_respaldo(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cartera_video_bienvenida(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.video_bienvenida_obtener_o_crear(uuid, uuid, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.video_bienvenida_registrar_apertura(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.video_bienvenida_marcar_enviado(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.video_bienvenida_tomar_respaldo(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cartera_video_bienvenida(uuid[]) TO service_role;
