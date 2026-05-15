-- =============================================================================
-- Migration: permitir stage='comprador' en deals
-- Date: 2026-05-14
--
-- El CHECK constraint deals_stage_check (creado en migración 20260506000001)
-- no incluye el nuevo stage 'comprador' que agregamos para opps de
-- "Quiere Comprar" venidas de GHL. Resultado: 4 opps fallaron en el import.
--
-- Mismo patrón que origin checks. Idempotente.
-- =============================================================================

DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name LIKE '%deals_stage%'
    ) INTO constraint_exists;
    IF constraint_exists THEN
        EXECUTE 'ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check';
        RAISE NOTICE 'Dropped deals_stage_check';
    END IF;
END $$;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'clase_gratuita',
    'request',
    'scheduled',
    'not_visited',
    'visited',
    'appraisal_sent',
    'followup',
    'captured',
    'lost',
    'comprador'
  ));
