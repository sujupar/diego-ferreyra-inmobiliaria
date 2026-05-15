-- =============================================================================
-- Migration: permitir type='complete_imported_property' en tasks
-- Date: 2026-05-14
--
-- El importer de GHL crea tareas de tipo 'complete_imported_property' para
-- cada propiedad importada como captada, asignadas al rol coordinador. El
-- CHECK constraint tasks_type_check no incluye este valor, así que las 5
-- properties captadas del import quedaron sin tarea asociada.
-- =============================================================================

DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name LIKE '%tasks_type%'
    ) INTO constraint_exists;
    IF constraint_exists THEN
        EXECUTE 'ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check';
        RAISE NOTICE 'Dropped tasks_type_check';
    END IF;
END $$;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_type_check
  CHECK (type IN (
    'update_contact',
    'new_assignment',
    'review_property',
    'rejected_docs',
    'complete_imported_property'
  ));
