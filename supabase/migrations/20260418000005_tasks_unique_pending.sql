-- supabase/migrations/20260418000005_tasks_unique_pending.sql
-- Defensa de DB contra duplicación de tasks pendientes.
--
-- La capa app (lib/supabase/tasks.ts → pendingTaskExists) ya hace check-then-insert,
-- pero entre el SELECT y el INSERT hay una ventana donde dos requests concurrentes
-- pueden ambos ver count=0 y ambos insertar. Estos índices únicos parciales lo
-- previenen a nivel DB: el segundo INSERT falla con violation y el caller en
-- /api/deals/[id]/advance ya tiene try/catch que captura el error.
--
-- Una task pendiente es única por (assigned_to, type, entidad de referencia).
-- Para cubrir las 4 entidades (deal_id, appraisal_id, property_id, contact_id)
-- usamos índices parciales que aplican según qué FK esté presente. Esto matchea
-- la lógica de pickEntityFilter en lib/supabase/tasks.ts (priority: deal > appraisal
-- > property > contact).

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_pending_deal
    ON tasks (assigned_to, type, deal_id)
    WHERE status = 'pending' AND deal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_pending_appraisal
    ON tasks (assigned_to, type, appraisal_id)
    WHERE status = 'pending' AND appraisal_id IS NOT NULL AND deal_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_pending_property
    ON tasks (assigned_to, type, property_id)
    WHERE status = 'pending' AND property_id IS NOT NULL AND deal_id IS NULL AND appraisal_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_pending_contact
    ON tasks (assigned_to, type, contact_id)
    WHERE status = 'pending' AND contact_id IS NOT NULL AND deal_id IS NULL AND appraisal_id IS NULL AND property_id IS NULL;
