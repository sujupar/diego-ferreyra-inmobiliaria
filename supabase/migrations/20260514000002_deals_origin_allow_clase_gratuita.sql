-- =============================================================================
-- Migration: permitir origin='clase_gratuita' en deals
-- Date: 2026-05-14
--
-- Mismo bug que en contacts (ver 20260514000001). El webhook y el importer
-- usan 'clase_gratuita' como origin pero el CHECK constraint lo rechaza.
-- =============================================================================

DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name LIKE '%deals_origin%'
    ) INTO constraint_exists;

    IF constraint_exists THEN
        EXECUTE 'ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_origin_check';
        RAISE NOTICE 'Dropped deals_origin_check';
    END IF;
END $$;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_origin_check
  CHECK (origin IS NULL OR origin IN ('embudo', 'referido', 'historico', 'clase_gratuita'));
