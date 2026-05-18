-- =============================================================================
-- Migration: extender tabla tasks para soportar follow-ups agendados
-- Date: 2026-05-16
--
-- El modal "Seguimiento" del pipeline ahora genera una tarea con canal
-- (call/email/message), fecha de vencimiento y opcionalmente una hora
-- específica. La task aparece en /tasks recién el día que vence.
-- =============================================================================

-- 1) Agregar columnas
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS due_time time,
  ADD COLUMN IF NOT EXISTS all_day boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text;

-- 2) channel solo válido para follow-ups; queda null en otras tareas.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_channel_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_channel_check
  CHECK (channel IS NULL OR channel IN ('call','email','message'));

-- 3) Extender CHECK type para incluir 'follow_up'.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_type_check
  CHECK (type IN (
    'update_contact',
    'new_assignment',
    'review_property',
    'rejected_docs',
    'complete_imported_property',
    'follow_up'
  ));

-- 4) Índice para listar pendientes por fecha de vencimiento.
CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON public.tasks (assigned_to, due_date)
  WHERE status = 'pending';

-- 5) Los índices únicos parciales preexistentes deduplicaban
-- (assigned_to, type, entidad) para todo tipo de task pending. Para follow_up
-- queremos permitir múltiples follow-ups al mismo deal/property en distintas
-- fechas, así que recreamos cada índice excluyendo type='follow_up'.

DROP INDEX IF EXISTS uq_tasks_pending_deal;
CREATE UNIQUE INDEX uq_tasks_pending_deal
  ON public.tasks (assigned_to, type, deal_id)
  WHERE status = 'pending' AND deal_id IS NOT NULL AND type <> 'follow_up';

DROP INDEX IF EXISTS uq_tasks_pending_appraisal;
CREATE UNIQUE INDEX uq_tasks_pending_appraisal
  ON public.tasks (assigned_to, type, appraisal_id)
  WHERE status = 'pending' AND appraisal_id IS NOT NULL AND deal_id IS NULL AND type <> 'follow_up';

DROP INDEX IF EXISTS uq_tasks_pending_property;
CREATE UNIQUE INDEX uq_tasks_pending_property
  ON public.tasks (assigned_to, type, property_id)
  WHERE status = 'pending' AND property_id IS NOT NULL AND deal_id IS NULL AND appraisal_id IS NULL AND type <> 'follow_up';

DROP INDEX IF EXISTS uq_tasks_pending_contact;
CREATE UNIQUE INDEX uq_tasks_pending_contact
  ON public.tasks (assigned_to, type, contact_id)
  WHERE status = 'pending' AND contact_id IS NOT NULL AND deal_id IS NULL AND appraisal_id IS NULL AND property_id IS NULL AND type <> 'follow_up';
