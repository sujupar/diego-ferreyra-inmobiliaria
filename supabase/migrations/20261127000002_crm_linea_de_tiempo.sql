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

-- 2. El historial ahora guarda el autor. Misma firma y mismo trigger que
--    20260520000001 (AFTER INSERT OR UPDATE OF stage): solo se suma changed_by.
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
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    SELECT p.id INTO v_autor FROM public.profiles p WHERE p.id = COALESCE(auth.uid(), NEW.stage_changed_by);
    INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at, changed_by)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stage END,
      NEW.stage,
      NOW(),
      v_autor
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
