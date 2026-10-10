-- Sistema de visitas — Entrega 1. Spec: docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md §4.1
-- ADITIVA. Se aplica con scripts/apply-visitas-origen-pg.ts ANTES del deploy del código que la usa
-- (el alta nueva escribe origin/lead_id: sin estas columnas, agendar falla en producción).
--
-- Ronda 1 (auditoría de base, .superpowers/sdd/2026-10-10-sistema-de-visitas-entrega-1/task-1-db-review.md):
-- corregido C1 (borrar un asesor con visitas rompía por el FK del historial), I1 (actor
-- falsificable/pegado), I2 (reabrir arrastraba motivo y nota viejos — con el ajuste del
-- controlador: completion_notes sobrevive si la reapertura manda uno nuevo), M1 (orden del
-- historial), M2 (RLS: InitPlan), M3 (privilegios por defecto), M4 (search_path) y M7 (backfill
-- no finge un estado inicial que no fue). M6/M8 quedan documentados en comentario, sin cambiar
-- el comportamiento (decisión del controlador). M9/M10 no se tocan (quedan para otra tarea).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Teléfono normalizado: últimos 10 dígitos. MISMA expresión que
--    contacts.phone_norm (20260816000001) y lib/phone/ultimos-digitos.ts.
--    Si se cambia una, se cambian las tres.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.property_leads
  ADD COLUMN IF NOT EXISTS phone_norm TEXT GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_property_leads_property_phone_norm
  ON public.property_leads (property_id, phone_norm) WHERE phone_norm IS NOT NULL;

ALTER TABLE public.portal_inquiries
  ADD COLUMN IF NOT EXISTS phone_norm TEXT GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(coalesce(lead_phone, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(coalesce(lead_phone, ''), '\D', '', 'g'), 10)
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_property_phone_norm
  ON public.portal_inquiries (property_id, phone_norm) WHERE phone_norm IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) property_visits: de dónde vino, quién es, tiempos y motivo.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.property_visits
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS origin_detail TEXT,
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.property_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_inquiry_id UUID REFERENCES public.portal_inquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_reason TEXT,
  ADD COLUMN IF NOT EXISTS advisor_interest TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- El catálogo vive TAMBIÉN en lib/visitas/origen.ts (ORIGENES_VISITA); origen.test.ts
-- lee este archivo y falla si difieren. Se tocan juntos.
--
-- Nota (auditoría, M6): estos 3 CHECK se recrean con DROP + ADD a propósito, para que esta
-- migración se pueda re-ejecutar TAL COMO ESTÁ hoy sin romper nada (ya se probó dos veces).
-- Pero el día que un catálogo (origin/outcome_reason/advisor_interest) se ENSANCHE en una
-- migración nueva, volver a correr ESTE archivo después de esa migración nueva: FALLA si ya
-- hay filas usando el valor agregado ("is violated by some row"), o REVIERTE el catálogo en
-- silencio si no las hay todavía. Es la misma trampa que ya mordió a `conversation_ai_state`
-- (ver CLAUDE.md). Por eso: una vez que un catálogo cambie, ESTE archivo queda histórico — el
-- ensanche va en una migración nueva, nunca editando este archivo in place. Lo mismo aplica
-- más abajo a los `CREATE OR REPLACE FUNCTION` y a las `DROP POLICY + CREATE POLICY`.
ALTER TABLE public.property_visits DROP CONSTRAINT IF EXISTS property_visits_origin_check;
ALTER TABLE public.property_visits ADD CONSTRAINT property_visits_origin_check
  CHECK (origin IS NULL OR origin IN ('portal', 'publicidad_meta', 'publicidad_paga', 'cartel', 'otro'));

ALTER TABLE public.property_visits DROP CONSTRAINT IF EXISTS property_visits_outcome_reason_check;
ALTER TABLE public.property_visits ADD CONSTRAINT property_visits_outcome_reason_check
  CHECK (outcome_reason IS NULL OR outcome_reason IN
    ('no_vino', 'cancelo_persona', 'cancelo_propietario', 'cancelamos_nosotros', 'no_disponible', 'otro'));

ALTER TABLE public.property_visits DROP CONSTRAINT IF EXISTS property_visits_advisor_interest_check;
ALTER TABLE public.property_visits ADD CONSTRAINT property_visits_advisor_interest_check
  CHECK (advisor_interest IS NULL OR advisor_interest IN ('alto', 'medio', 'bajo'));

COMMENT ON COLUMN public.property_visits.origin IS
  'De dónde vino la visita. NULL solo en filas anteriores al 2026-10-10. Catálogo: lib/visitas/origen.ts.';
COMMENT ON COLUMN public.property_visits.changed_by IS
  'Quién hizo el ÚLTIMO cambio. Toda escritura que cambie status/scheduled_at/advisor_id lo manda explícito (NULL = agente, cliente o sistema). El trigger lo copia al historial, pero si hay sesión de usuario el trigger lo pisa con auth.uid() (no se puede falsificar desde el cliente).';

CREATE INDEX IF NOT EXISTS idx_property_visits_lead ON public.property_visits (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_visits_portal_inquiry ON public.property_visits (portal_inquiry_id) WHERE portal_inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_visits_advisor_when ON public.property_visits (advisor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_property_visits_property_when ON public.property_visits (property_id, scheduled_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Historial de la visita. Solo crece. Lo escribe ÚNICAMENTE el trigger AFTER.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_visit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.property_visits(id) ON DELETE CASCADE,
  -- (auditoría, M10: nombrarlo explícito es un no-op — Postgres genera el mismo nombre por
  -- default para un CHECK de una sola columna — se deja sin nombrar, como estaba.)
  kind TEXT NOT NULL CHECK (kind IN ('creada', 'confirmada', 'reprogramada', 'realizada',
    'no_realizada', 'cancelada', 'asesor_cambiado', 'reabierta', 'estado_cambiado')),
  from_status TEXT,
  to_status TEXT,
  from_scheduled_at TIMESTAMPTZ,
  to_scheduled_at TIMESTAMPTZ,
  from_advisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_advisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  note TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- (auditoría, M1): now() empata eventos del MISMO UPDATE (ej. confirmar + reprogramar
  -- juntos) con el mismo created_at, y "ORDER BY created_at, kind" los ordena alfabéticamente
  -- en vez de por orden real. clock_timestamp() avanza dentro de la misma transacción.
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_property_visit_events_visit ON public.property_visit_events (visit_id, created_at);

ALTER TABLE public.property_visit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS property_visit_events_select ON public.property_visit_events;
-- (auditoría, M2): auth.uid() / is_operations_user() envueltos en (SELECT …) para que el
-- planner los resuelva como InitPlan (una vez por consulta) en vez de una vez por fila. Y
-- "visit_id" calificado: sin calificar resolvía a esta misma tabla solo porque
-- property_visits no tiene esa columna — funcionaba de casualidad, no por diseño.
CREATE POLICY property_visit_events_select ON public.property_visit_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_operations_user())
    OR EXISTS (
      SELECT 1 FROM public.property_visits v
      WHERE v.id = property_visit_events.visit_id
        AND (v.advisor_id = (SELECT auth.uid()) OR v.created_by = (SELECT auth.uid()))
    )
  );
-- Sin políticas de INSERT/UPDATE/DELETE: solo el trigger (SECURITY DEFINER) y el service role.
-- (auditoría, M3): por defecto anon/authenticated reciben arwdDxtm sobre cualquier tabla
-- nueva. La RLS ya frena INSERT/UPDATE/DELETE desde esos roles, pero TRUNCATE NO pasa por RLS
-- — esto es defensa en profundidad (PostgREST no expone TRUNCATE, así que no cambia nada
-- visible para la app; es higiene, no un fix de un bug explotable hoy).
REVOKE ALL ON public.property_visit_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.property_visit_events FROM authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Triggers. Regla de CLAUDE.md: el BEFORE solo toca NEW; lo que escribe en
--    OTRA tabla va en un AFTER (en BEFORE INSERT la fila todavía no existe y el
--    FK del historial fallaría).
-- ───────────────────────────────────────────────────────────────────────────
-- (auditoría, M4): SET search_path = '' — más estricto que 'public' para una función que
-- corre con los privilegios de quien la definió (ver la de abajo, SECURITY DEFINER). Todo acá
-- ya está calificado (auth.uid(), now(), gen_random_uuid(), clock_timestamp() resuelven por
-- pg_catalog, que siempre se busca aunque search_path esté vacío), así que no cambia nada.
CREATE OR REPLACE FUNCTION public.property_visits_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- (auditoría, I1): el actor sale del JWT cuando hay sesión de usuario. Así no se puede
  -- falsificar mandando otro changed_by desde el cliente, y no queda "pegado" del cambio
  -- anterior de otra persona. Con service role auth.uid() es NULL: ahí vale lo que mande la
  -- app, que DEBE mandar changed_by explícito (id del usuario, o null si es agente/cliente/
  -- sistema) — ese es el único camino que puede quedar con el actor equivocado si se olvida.
  IF v_uid IS NOT NULL THEN NEW.changed_by := v_uid; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'scheduled' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    IF NEW.status IN ('completed', 'no_show', 'cancelled') AND NEW.outcome_at IS NULL THEN NEW.outcome_at := now(); END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'scheduled' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    IF NEW.status IN ('completed', 'no_show', 'cancelled') THEN NEW.outcome_at := now(); END IF;
    IF NEW.status = 'completed' THEN NEW.completed_at := now(); END IF;
    -- Reabierta: vuelve a estar viva, sin resultado.
    -- (auditoría, I2 — con el ajuste del controlador sobre la propuesta del informe):
    -- outcome_reason y advisor_interest se limpian SIEMPRE (el resultado anterior ya quedó
    -- en su propio evento de historial). completion_notes se limpia SOLO si esta misma
    -- escritura no le puso un valor nuevo: la app manda 'Reabierta: <motivo>' en
    -- completion_notes al reabrir, en la MISMA escritura que cambia el status, y ese texto
    -- tiene que sobrevivir para que el trigger AFTER lo copie al evento 'reabierta'. Si nadie
    -- manda un valor nuevo (completion_notes llega igual al de antes), se limpia para no
    -- arrastrar la nota del resultado viejo.
    IF NEW.status IN ('pending_confirmation', 'scheduled') AND OLD.status IN ('completed', 'no_show', 'cancelled') THEN
      NEW.outcome_at := NULL;
      NEW.completed_at := NULL;
      NEW.outcome_reason := NULL;
      NEW.advisor_interest := NULL;
      IF NEW.completion_notes IS NOT DISTINCT FROM OLD.completion_notes THEN
        NEW.completion_notes := NULL;
      END IF;
    END IF;
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    NEW.reschedule_count := OLD.reschedule_count + 1;
    -- (auditoría, M8, documentado sin cambiar el comportamiento): esto también suma cuando
    -- upsertPendingVisit mueve una visita que TODAVÍA es pending_confirmation (una propuesta
    -- sin confirmar que se vuelve a proponer) — no solo cuando se reprograma una visita ya
    -- confirmada. Es decisión de producto dejarlo así. Si el día de mañana una métrica de
    -- "reprogramaciones" tiene que contar solo visitas YA CONFIRMADAS que se movieron,
    -- condicionar el incremento a `OLD.confirmed_at IS NOT NULL` (el evento 'reprogramada'
    -- del historial, en cambio, conviene dejarlo sin condicionar en cualquier caso).
    -- El aviso "¿se realizó?" vuelve a aplicar a la fecha nueva.
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_property_visits_before_write ON public.property_visits;
CREATE TRIGGER trg_property_visits_before_write
  BEFORE INSERT OR UPDATE ON public.property_visits
  FOR EACH ROW EXECUTE FUNCTION public.property_visits_before_write();

CREATE OR REPLACE FUNCTION public.property_visits_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k TEXT;
  v_actor UUID;
BEGIN
  -- (auditoría, C1 — CRÍTICO, reproducido: borrar un usuario que es asesor de una visita
  -- fallaba con "Database error deleting user"). Un perfil puede estar BORRÁNDOSE en ESTA
  -- MISMA transacción: el DELETE de auth.users cascadea a profiles, y el FK
  -- property_visits.advisor_id … ON DELETE SET NULL dispara un UPDATE que pone advisor_id en
  -- NULL — ese UPDATE nombra advisor_id, así que ESTE trigger AFTER se dispara con
  -- NEW.changed_by/OLD.advisor_id apuntando a un perfil que, para el momento en que este
  -- trigger corre, ya no existe. Si se inserta ese id tal cual, el FK del historial lo
  -- rechaza y aborta el borrado del usuario completo. Resolviendo contra profiles ACÁ: si el
  -- perfil ya no existe, el historial queda con NULL (no con un id colgado) y el borrado del
  -- usuario puede completarse.
  SELECT p.id INTO v_actor FROM public.profiles p WHERE p.id = NEW.changed_by;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.property_visit_events (visit_id, kind, to_status, to_scheduled_at, to_advisor_id, actor_id)
    VALUES (NEW.id, 'creada', NEW.status, NEW.scheduled_at, NEW.advisor_id, v_actor);
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    k := CASE
      WHEN NEW.status = 'completed' THEN 'realizada'
      WHEN NEW.status = 'no_show' THEN 'no_realizada'
      WHEN NEW.status = 'cancelled' THEN 'cancelada'
      WHEN OLD.status IN ('completed', 'no_show', 'cancelled') THEN 'reabierta'
      WHEN NEW.status = 'scheduled' AND OLD.status = 'pending_confirmation' THEN 'confirmada'
      ELSE 'estado_cambiado'
    END;
    INSERT INTO public.property_visit_events (visit_id, kind, from_status, to_status, reason, note, actor_id)
    VALUES (
      NEW.id, k, OLD.status, NEW.status,
      CASE WHEN k IN ('no_realizada', 'cancelada') THEN NEW.outcome_reason END,
      -- (auditoría, I2 — override del controlador): 'reabierta' SÍ entra acá a propósito. El
      -- informe original lo sacaba (perdía la nota de la reapertura); el controlador decidió
      -- que el motivo de la reapertura ("Reabierta: <motivo>") sobreviva en completion_notes
      -- (ver el BEFORE arriba) y se copie al evento.
      CASE WHEN k IN ('realizada', 'no_realizada', 'cancelada', 'reabierta') THEN NEW.completion_notes END,
      v_actor
    );
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    INSERT INTO public.property_visit_events (visit_id, kind, from_scheduled_at, to_scheduled_at, actor_id)
    VALUES (NEW.id, 'reprogramada', OLD.scheduled_at, NEW.scheduled_at, v_actor);
  END IF;

  IF NEW.advisor_id IS DISTINCT FROM OLD.advisor_id THEN
    -- (auditoría, C1): from_advisor_id TAMBIÉN se resuelve contra profiles por la misma razón
    -- — el borrado de un asesor es justamente el caso que pone NEW.advisor_id en NULL y
    -- dispara esta rama con OLD.advisor_id apuntando al perfil que se está borrando.
    INSERT INTO public.property_visit_events (visit_id, kind, from_advisor_id, to_advisor_id, actor_id)
    VALUES (NEW.id, 'asesor_cambiado',
      (SELECT p.id FROM public.profiles p WHERE p.id = OLD.advisor_id),
      NEW.advisor_id, v_actor);
  END IF;
  RETURN NULL;
END $$;
-- (auditoría, M3): una función de trigger no se puede invocar directo (solo el motor la
-- llama al disparar el trigger), así que el EXECUTE que trae por default es higiene, no un
-- agujero real — pero sacarlo deja más claro quién puede hacer qué.
REVOKE EXECUTE ON FUNCTION public.property_visits_log_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_property_visits_log_event ON public.property_visits;
CREATE TRIGGER trg_property_visits_log_event
  AFTER INSERT OR UPDATE OF status, scheduled_at, advisor_id ON public.property_visits
  FOR EACH ROW EXECUTE FUNCTION public.property_visits_log_event();

-- Historial de las filas que ya existían: un evento 'creada' RECONSTRUIDO, no un hecho real.
-- (auditoría, M7 — con el ajuste del controlador sobre la propuesta del informe): to_status
-- va en NULL (no en v.status, que es el estado DE HOY, no el inicial — con ese valor las 8
-- canceladas históricas mostrarían "Creada → Cancelada" como si ese hubiera sido su primer
-- estado real). El note deja explícito que esto es un placeholder, no un evento capturado en
-- el momento. Idempotente: no duplica si se re-ejecuta.
INSERT INTO public.property_visit_events (visit_id, kind, to_status, to_scheduled_at, to_advisor_id, actor_id, note, created_at)
SELECT v.id, 'creada', NULL, v.scheduled_at, v.advisor_id, v.created_by,
       'Registrada antes del historial', v.created_at
FROM public.property_visits v
WHERE NOT EXISTS (SELECT 1 FROM public.property_visit_events e WHERE e.visit_id = v.id AND e.kind = 'creada');

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RLS de lectura de visitas: antes CUALQUIER usuario (abogado incluido).
--    Ahora operaciones, el asesor de la visita o quien la creó. El agente y el
--    link del recorrido usan service role: no les afecta.
-- ───────────────────────────────────────────────────────────────────────────
-- (auditoría, M2): mismo ajuste InitPlan que en la política de arriba.
DROP POLICY IF EXISTS property_visits_select_all ON public.property_visits;
DROP POLICY IF EXISTS property_visits_select_scoped ON public.property_visits;
CREATE POLICY property_visits_select_scoped ON public.property_visits
  FOR SELECT TO authenticated
  USING ((SELECT public.is_operations_user()) OR advisor_id = (SELECT auth.uid()) OR created_by = (SELECT auth.uid()));
