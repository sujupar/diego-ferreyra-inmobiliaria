-- =============================================================================
-- Migration: permitir origin='clase_gratuita' en contacts
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- La tabla `contacts` tenía un CHECK constraint que solo permitía
--   origin IN ('embudo', 'referido', 'historico')
-- pero el webhook GHL form-submission y el importer de GHL setean
-- origin='clase_gratuita' para leads que vienen de la Clase de Propietarios.
-- Esto bloqueaba inserts. Mismo origin ya existe en `deals.origin` (sin CHECK).
--
-- Idempotente. Pegar en Supabase Dashboard → SQL Editor → Run.
-- =============================================================================

DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    -- Drop el constraint viejo si está
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name LIKE '%contacts_origin%'
    ) INTO constraint_exists;

    IF constraint_exists THEN
        EXECUTE 'ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_origin_check';
        RAISE NOTICE 'Dropped contacts_origin_check';
    END IF;
END $$;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_origin_check
  CHECK (origin IS NULL OR origin IN ('embudo', 'referido', 'historico', 'clase_gratuita'));
