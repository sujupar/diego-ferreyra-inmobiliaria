-- supabase/migrations/20260718000001_property_plans.sql
-- Planos de la propiedad (PDFs o imágenes) subidos por el asesor al captar.
-- URLs públicas del bucket `property-files` bajo properties/{id}/plans/.
-- Aditiva e idempotente — correr a mano en el Dashboard SQL Editor.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS plans TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.properties.plans IS
  'Planos de la propiedad (URLs públicas en Storage: property-files/properties/{id}/plans/). PDF o imagen. No participa del auto-avance de captación.';
