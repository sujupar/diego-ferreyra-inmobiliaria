-- =============================================================================
-- Migration: flags para importación masiva de propiedades pre-captadas
-- Date: 2026-06-25
--
-- CONTEXTO
-- --------
-- La inmobiliaria operaba antes del software y tiene propiedades YA captadas
-- (publicadas en portales, legalmente aprobadas) que se suben en bloque desde
-- un CSV. Quedan como CAPTADAS (status='approved' + legal_status='approved'),
-- pero con dos cosas pendientes que la UI debe señalar:
--   - los ARCHIVOS de la documentación legal todavía no se subieron → legal_docs_pending
--   - el ORIGEN del lead aún no se asignó → origin_pending
--
-- 100% ADITIVA: 4 columnas nuevas con default + 1 índice. No toca nada existente.
-- Correr en el SQL Editor del Dashboard (la CLI no conecta).
-- =============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS import_source       text,    -- ej. 'csv_precaptada'
  ADD COLUMN IF NOT EXISTS import_external_id  text,    -- ID Zonaprop (clave de dedup)
  ADD COLUMN IF NOT EXISTS legal_docs_pending  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin_pending      boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.properties.import_source IS
  'Marca de propiedad importada en bloque (ej. csv_precaptada). NULL = captada por el flujo normal.';
COMMENT ON COLUMN public.properties.legal_docs_pending IS
  'true = aprobada legalmente pero faltan SUBIR los archivos de documentación.';
COMMENT ON COLUMN public.properties.origin_pending IS
  'true = importada, falta asignar el origin del lead.';

-- Dedup idempotente: una propiedad por ID externo de importación.
-- Índice PARCIAL: las captadas normales (import_external_id NULL) no chocan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_import_external_id
  ON public.properties (import_external_id)
  WHERE import_external_id IS NOT NULL;

-- Verificación (opcional):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='properties' AND column_name IN
--   ('import_source','import_external_id','legal_docs_pending','origin_pending');
