-- Caché de atributos de categoría de MercadoLibre.
-- Se llena on-demand desde GET /categories/{id}/attributes con TTL de 24h
-- (la lógica de TTL vive en lib/portals/mercadolibre/category-attributes.ts).
CREATE TABLE IF NOT EXISTS ml_category_attributes (
  category_id text PRIMARY KEY,
  attributes  jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ml_category_attributes ENABLE ROW LEVEL SECURITY;

-- Lectura para usuarios autenticados (el wizard la consulta indirectamente vía
-- service_role, pero dejamos SELECT por si se inspecciona desde el dashboard).
DROP POLICY IF EXISTS ml_cat_attrs_select ON ml_category_attributes;
CREATE POLICY ml_cat_attrs_select ON ml_category_attributes
  FOR SELECT TO authenticated USING (true);

-- Escritura solo service_role (la hace el server con SUPABASE_SERVICE_ROLE_KEY,
-- que bypassa RLS; no se otorga a authenticated).
