-- crm-tareas-y-campanita (pregunta 5 al dueño): la tarea de entrada de un lead se completa
-- sola cuando su proceso sale de "Solicitud". Sin esto, las dos copias de la coordinación
-- quedaban pendientes para siempre (de 126 en 60 días se completó 1) y la campanita, que
-- desde este change las hace sonar, llegaría a "99+" con leads ya atendidos.
--
-- "Solicitud" es la regla de la plataforma (etapaCRM): `request`, o `scheduled` sin día.
-- Solo toca las tareas de entrada NUEVAS (canal 'call', que es como nacen desde este
-- change): las viejas sin canal siguen como están. Trigger AFTER (CLAUDE.md: escribir en
-- otra tabla desde un BEFORE falla) y SECURITY DEFINER (la RLS de `tasks` no frena al
-- sistema). Quién la completó: el autor del cambio de etapa, igual que el historial.
CREATE OR REPLACE FUNCTION public.fn_deals_cerrar_tareas_de_entrada()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_era_solicitud boolean;
  v_es_solicitud boolean;
  v_autor uuid;
BEGIN
  v_era_solicitud := OLD.stage = 'request' OR (OLD.stage = 'scheduled' AND OLD.scheduled_date IS NULL);
  v_es_solicitud := NEW.stage = 'request' OR (NEW.stage = 'scheduled' AND NEW.scheduled_date IS NULL);
  IF v_era_solicitud AND NOT v_es_solicitud THEN
    SELECT p.id INTO v_autor FROM public.profiles p WHERE p.id = COALESCE(auth.uid(), NEW.stage_changed_by);
    UPDATE public.tasks
       SET status = 'completed', completed_at = now(), completed_by = v_autor
     WHERE deal_id = NEW.id
       AND type = 'update_contact'
       AND channel = 'call'
       AND status = 'pending';
  ELSIF NOT v_era_solicitud AND v_es_solicitud THEN
    -- El camino inverso ("Deshacer perdido", o se le borra el día): el lead vuelve a
    -- esperar, así que sus tareas de entrada vuelven a pendientes (revisión de código, 2).
    -- Nunca las que cerró una llamada (eso se deshace anulando la llamada), y nunca si la
    -- misma persona ya tiene otra pendiente igual (el índice único uq_tasks_pending_deal
    -- tiraría abajo el cambio de etapa entero).
    UPDATE public.tasks t
       SET status = 'pending', completed_at = NULL, completed_by = NULL
     WHERE t.deal_id = NEW.id
       AND t.type = 'update_contact'
       AND t.channel = 'call'
       AND t.status = 'completed'
       AND t.closed_by_activity_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.tasks o
          WHERE o.assigned_to IS NOT DISTINCT FROM t.assigned_to
            AND o.type = t.type AND o.deal_id = t.deal_id AND o.status = 'pending'
       );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deals_cerrar_tareas_de_entrada ON public.deals;
CREATE TRIGGER trg_deals_cerrar_tareas_de_entrada
  AFTER UPDATE OF stage, scheduled_date ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.fn_deals_cerrar_tareas_de_entrada();
