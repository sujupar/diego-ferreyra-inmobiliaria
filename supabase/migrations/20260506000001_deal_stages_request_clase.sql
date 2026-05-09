-- =============================================================================
-- Migration: nuevos stages para integración GHL → CRM
-- Date: 2026-05-06 (corregido 2026-05-09)
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
-- IMPORTANTE: la tabla `deals` tiene un CHECK constraint `deals_stage_check`
-- que limita los valores permitidos. Tenemos que dropearlo y recrearlo con
-- los nuevos stages ANTES del backfill, sino el UPDATE viola la constraint.
--
-- INSTRUCCIONES
-- -------------
-- 1. Pegar en Supabase Dashboard → SQL Editor → Run.
-- 2. Idempotente: re-ejecutar es seguro.
-- 3. Verificar conteos al final con la query final.
-- =============================================================================

-- Step 1: dropear el CHECK constraint viejo (que no permite los nuevos stages).
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;

-- Step 2: recrear el CHECK con los 9 valores válidos.
ALTER TABLE public.deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'clase_gratuita',
    'request',
    'scheduled',
    'not_visited',
    'visited',
    'appraisal_sent',
    'followup',
    'captured',
    'lost'
  ));

-- Step 3: backfill — deals con stage='scheduled' y SIN scheduled_date son
-- leads que todavía no fueron coordinados. Pasarlos al nuevo stage 'request'.
UPDATE public.deals
SET stage = 'request',
    stage_changed_at = COALESCE(stage_changed_at, created_at),
    updated_at = NOW()
WHERE stage = 'scheduled'
  AND scheduled_date IS NULL;

-- Step 4: documentar valores en el comment de la columna.
COMMENT ON COLUMN public.deals.stage IS
  'CRM stage. Valores válidos: clase_gratuita, request, scheduled, not_visited, visited, appraisal_sent, followup, captured, lost.';

-- Verificación (no es destructiva — devuelve los conteos por stage).
-- SELECT stage, COUNT(*) FROM public.deals GROUP BY stage ORDER BY 2 DESC;
