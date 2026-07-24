-- =============================================================================
-- E1.0 — Ampliar el CHECK de funnel_type en landing_page_visits
-- =============================================================================
-- Parte del plan docs/superpowers/plans/2026-07-23-landing-y-campana-v3.
--
-- Hoy landing_page_visits.funnel_type solo admite ('clase_gratuita','tasacion',
-- 'otro') — migración 20260518000005. Las landings de PROPIEDAD necesitan
-- 'venta_propiedad' y 'alto_valor' para que las métricas del embudo sean
-- correctas (hoy caen todas en 'otro' hardcodeado en app/p/[slug]/page.tsx).
--
-- IDEMPOTENTE. Correr en el Dashboard SQL Editor.
-- GATE: correr ANTES de deployar el código de track-visit que escribe los
-- valores nuevos (sin el CHECK ampliado, el INSERT viola la constraint).
-- =============================================================================

-- El CHECK es inline (sin nombre explícito), así que Postgres lo auto-nombró.
-- Lo buscamos dinámicamente y lo dropeamos, sea cual sea su nombre.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.landing_page_visits'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%funnel_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.landing_page_visits DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.landing_page_visits
  ADD CONSTRAINT landing_page_visits_funnel_type_check
  CHECK (funnel_type IN ('clase_gratuita','tasacion','venta_propiedad','alto_valor','otro'));

-- El histórico con funnel_type='otro' NO se reclasifica (series intactas).

-- =============================================================================
-- VERIFICACIÓN:
--   INSERT ... funnel_type='venta_propiedad'  -> debe pasar.
--   INSERT ... funnel_type='inexistente'      -> debe fallar (CHECK).
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname='landing_page_visits_funnel_type_check';
-- =============================================================================
