-- =============================================================================
-- Migration: agregar columna description a properties
-- Date: 2026-05-06
--
-- Las tasaciones tienen `appraisals.property_description` con la descripción
-- redactada por el asesor. Cuando captamos la propiedad, queremos copiar esa
-- descripción para no perderla y no obligar al asesor a re-redactarla.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar el contenido de este archivo y ejecutar.
-- 3. Verificar: \d properties debería mostrar la columna description.
-- =============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.properties.description IS
  'Descripción comercial de la propiedad (heredada de appraisals.property_description al captar).';
