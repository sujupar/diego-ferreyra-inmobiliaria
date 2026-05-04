-- =============================================================================
-- Migration: Add report_edits JSONB column to appraisals
-- Date: 2026-05-04
--
-- Persiste los textos editables del PDF (estrategia, conclusiones, títulos
-- custom, etc.) que hoy se pierden cada vez que el usuario recarga la
-- tasación.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar el contenido de este archivo y ejecutar.
-- 3. La columna acepta NULL para tasaciones legacy (se hidratan con defaults
--    en el cliente).
-- =============================================================================

ALTER TABLE public.appraisals
    ADD COLUMN IF NOT EXISTS report_edits JSONB;

-- Verificación post-aplicación:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'appraisals' AND column_name = 'report_edits';
