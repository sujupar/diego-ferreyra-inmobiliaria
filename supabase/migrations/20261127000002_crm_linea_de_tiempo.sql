-- crm-linea-de-tiempo (design.md D1): empezar a guardar QUIÉN cambia una etapa y quién
-- completa una tarea, e índices para leer la línea de tiempo de un contacto.
--
-- Todo es repetible (IF NOT EXISTS / CREATE OR REPLACE). Lo anterior queda sin autor
-- (decisión 2 del dueño): no se completa nada hacia atrás.

-- 1. Autor del último cambio de etapa. Lo escribe la app en el MISMO UPDATE/INSERT que
--    cambia `stage` (las seis funciones de lib/supabase lo reciben como parámetro
--    obligatorio: null cuando es el sistema). El trigger lo copia al historial.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS stage_changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.deals.stage_changed_by IS
  'Quién hizo el último cambio de etapa (null = el sistema). Lo escribe la app junto con stage; '
  'fn_deals_write_stage_history lo copia a deal_stage_history.changed_by.';

-- 2. El historial ahora guarda el autor y el día de la tasación. Misma firma que
--    20260520000001; solo se suman changed_by y metadata, y un caso nuevo:
--
--    COORDINAR UNA SOLICITUD QUE YA ESTABA EN `scheduled` SIN DÍA. Para la plataforma esa
--    solicitud es "Solicitud" (regla de etapaCRM) y al ponerle día pasa a "Coordinada",
--    pero `stage` no cambia y el historial no se enteraba (auditoría, hallazgo 1). Ahora
--    ese paso también escribe una fila, `scheduled` → `scheduled`. Las métricas que leen
--    el historial toman la PRIMERA vez que un proceso llega a cada etapa: una fila a
--    `scheduled` más tardía no les cambia nada.
--
--    metadata = { scheduled_date, scheduled_date_antes }: con eso la línea de tiempo sabe
--    si `scheduled` era Solicitud o Coordinada en ese momento.
--
--    auth.uid() gana si hay sesión (no se puede falsificar desde un cliente con sesión);
--    con service role vale lo que mandó la app. El SELECT contra profiles evita violar la
--    FK si el perfil se está borrando (patrón de property_visits_log_event).
CREATE OR REPLACE FUNCTION public.fn_deals_write_stage_history()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_autor uuid;
  v_dia_antes date;
BEGIN
  v_dia_antes := CASE WHEN TG_OP = 'UPDATE' THEN OLD.scheduled_date END;
  IF (TG_OP = 'INSERT')
     OR (NEW.stage IS DISTINCT FROM OLD.stage)
     OR (NEW.stage = 'scheduled' AND OLD.stage = 'scheduled'
         AND OLD.scheduled_date IS NULL AND NEW.scheduled_date IS NOT NULL) THEN
    SELECT p.id INTO v_autor FROM public.profiles p WHERE p.id = COALESCE(auth.uid(), NEW.stage_changed_by);
    INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at, changed_by, metadata)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stage END,
      NEW.stage,
      NOW(),
      v_autor,
      jsonb_build_object('scheduled_date', NEW.scheduled_date, 'scheduled_date_antes', v_dia_antes)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ahora escucha también `scheduled_date` (para el caso nuevo de arriba).
DROP TRIGGER IF EXISTS trg_deals_write_stage_history ON public.deals;
CREATE TRIGGER trg_deals_write_stage_history
  AFTER INSERT OR UPDATE OF stage, scheduled_date ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.fn_deals_write_stage_history();

-- 3. Quién completó una tarea (null = el sistema o anterior a este change).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Con sesión propia (un cliente que escribe directo, no la app con service role) el autor
-- es SIEMPRE quien tiene la sesión: no se puede atribuir el cierre a otra persona.
CREATE OR REPLACE FUNCTION public.tasks_completed_by_de_la_sesion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.completed_by IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.completed_by END) THEN
    NEW.completed_by := CASE WHEN NEW.completed_by IS NULL THEN NULL ELSE auth.uid() END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tasks_completed_by_de_la_sesion ON public.tasks;
CREATE TRIGGER trg_tasks_completed_by_de_la_sesion
  BEFORE INSERT OR UPDATE OF completed_by ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_completed_by_de_la_sesion();

-- 4. Índices de lectura de la línea de tiempo (una persona por vez). Ya existían
--    idx_deal_stage_history_deal (deal_id, changed_at DESC) e idx_vvs_contact.
CREATE INDEX IF NOT EXISTS funnel_lead_submissions_contact_idx
  ON public.funnel_lead_submissions (contact_id) WHERE status = 'complete';
CREATE INDEX IF NOT EXISTS tasks_contact_idx
  ON public.tasks (contact_id);
