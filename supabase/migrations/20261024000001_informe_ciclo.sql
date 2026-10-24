-- Informe quincenal, Entrega 2: el ciclo automático del 1 y el 16 y el aviso a Paula.
-- Spec docs/superpowers/specs/2026-10-22-informe-quincenal-design.md ("Qué pasa por detrás", puntos 1 y 5).
--
-- 1. Tipo de tarea `informe_quincenal`. El CHECK y `TaskType` (lib/supabase/tasks.ts) se tocan JUNTOS: si la
--    app escribe un tipo que el CHECK no conoce, Postgres lo rechaza con 23514 y la tarea no se crea.
-- 2. `property_reports.avisado_at`: cuándo se avisó a la coordinación de ESTE informe del ciclo. El cron lo
--    reclama con un UPDATE condicional (`WHERE avisado_at IS NULL ... RETURNING`): dos corridas a la vez no
--    mandan dos emails por el mismo informe.
-- 3. Índice para que el cron encuentre la tanda del período (origen 'ciclo' + fecha de cierre).

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_type_check
  CHECK (type IN (
    'update_contact', 'new_assignment', 'review_property', 'rejected_docs',
    'complete_imported_property', 'follow_up', 'informe_quincenal'
  ));

ALTER TABLE public.property_reports ADD COLUMN IF NOT EXISTS avisado_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_property_reports_ciclo
  ON public.property_reports (hasta)
  WHERE origen = 'ciclo';
