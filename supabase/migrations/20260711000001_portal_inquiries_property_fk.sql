-- =============================================================================
-- FK real consulta → propiedad (sistema de consultas de portales)
-- =============================================================================
-- Hoy el vínculo consulta→propiedad vive en la convención de texto
-- portal_property_map.notes = 'property:<id>' (2 saltos, sin FK). Esta migración
-- lo reemplaza por FKs reales, alineando portal_inquiries al patrón ya probado
-- de property_leads. `notes` NO se elimina: sigue siendo la clave de dedup
-- idempotente de syncPortalPropertyMap (delete+insert por propiedad).
-- Spec: docs/superpowers/specs/2026-07-11-consultas-por-propiedad-design.md
--
-- ON DELETE SET NULL (regla del proyecto para FKs de historiales): borrar una
-- propiedad no rompe el histórico de consultas.
-- Todo idempotente (IF NOT EXISTS / guards IS NULL): re-ejecutable sin daño.
-- =============================================================================

-- 1) FK real en el mapa (reemplaza la convención notes='property:<id>').
ALTER TABLE public.portal_property_map
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_map_property
  ON public.portal_property_map (property_id);

-- 2) FK real en la consulta (el corazón del conteo por propiedad).
ALTER TABLE public.portal_inquiries
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

-- Ficha de propiedad: "consultas de ESTA propiedad, más recientes primero".
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_property
  ON public.portal_inquiries (property_id, received_at DESC);

-- Dashboard global: range-scan por fecha antes de agrupar.
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_received
  ON public.portal_inquiries (received_at);

COMMENT ON COLUMN public.portal_inquiries.property_id IS
  'Propiedad captada a la que pertenece la consulta (via matcher). NULL = sin identificar.';
COMMENT ON COLUMN public.portal_property_map.property_id IS
  'FK real a properties. Reemplaza la convención notes=''property:<id>'' (que se mantiene como clave de dedup).';

-- 3) Backfill del mapa desde notes (solo UUID válido y propiedad existente).
UPDATE public.portal_property_map m
   SET property_id = substring(m.notes from 'property:([0-9a-fA-F-]{36})')::uuid
 WHERE m.property_id IS NULL
   AND m.notes ~ 'property:[0-9a-fA-F-]{36}'
   AND EXISTS (
     SELECT 1 FROM public.properties p
      WHERE p.id = substring(m.notes from 'property:([0-9a-fA-F-]{36})')::uuid
   );

-- 4) Backfill de las consultas desde matched_map_id → map.property_id.
--    Re-ejecutable: correrlo de nuevo tras el deploy cubre las consultas
--    ingresadas entre la migración y el deploy del código.
UPDATE public.portal_inquiries pi
   SET property_id = m.property_id
  FROM public.portal_property_map m
 WHERE pi.matched_map_id = m.id
   AND m.property_id IS NOT NULL
   AND pi.property_id IS NULL;

-- =============================================================================
-- Verificación (correr a mano tras aplicar):
--   SELECT COUNT(*) AS total, COUNT(property_id) AS con_fk FROM public.portal_property_map;
--   SELECT COUNT(*) AS total, COUNT(property_id) AS con_fk FROM public.portal_inquiries;
--   -- con_fk del mapa ≈ filas con notes 'property:...'; con_fk de inquiries ≈ matcheadas.
-- =============================================================================
