-- =============================================================================
-- Migration: nuevos stages para integración GHL → CRM
-- Date: 2026-05-06
--
-- CONTEXTO
-- --------
-- Antes: "Solicitud" era un stage DERIVADO en UI (deal con stage='scheduled' y
-- scheduled_date IS NULL → "Solicitud"). Ahora se promueve a stage REAL.
--
-- Además agregamos `clase_gratuita`: un stage anterior a Solicitud, para leads
-- que se anotaron en la Clase de Propietarios pero todavía no pidieron
-- tasación.
--
-- La columna `deals.stage` es text libre (sin CHECK constraint), entonces no
-- requiere ALTER de tipo. Solo backfill.
--
-- INSTRUCCIONES
-- -------------
-- 1. Pegar en Supabase Dashboard → SQL Editor → Run.
-- 2. Verificar conteos pre/post con la query al final.
-- 3. Idempotente: re-ejecutar es seguro.
-- =============================================================================

-- Backfill: deals con stage='scheduled' y SIN scheduled_date son leads que
-- todavía no fueron coordinados. Los pasamos al nuevo stage 'request'.
UPDATE public.deals
SET stage = 'request',
    stage_changed_at = COALESCE(stage_changed_at, created_at),
    updated_at = NOW()
WHERE stage = 'scheduled'
  AND scheduled_date IS NULL;

-- Verificación (descomentar para correr ad-hoc):
-- SELECT stage, COUNT(*) FROM public.deals GROUP BY stage ORDER BY 2 DESC;

COMMENT ON COLUMN public.deals.stage IS
  'CRM stage. Valores válidos: clase_gratuita, request, scheduled, not_visited, visited, appraisal_sent, followup, captured, lost.';
