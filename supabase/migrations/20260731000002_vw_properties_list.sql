-- Listado de propiedades sin arrastrar las fotos.
--
-- POR QUÉ: medido el 2026-07-30, el listado devolvía 21.951 KB por request y el
-- 99% eran las fotos — hay imágenes guardadas como base64 DENTRO de la base (la
-- más larga: 4.439.566 caracteres). Con solo las columnas del listado, lo mismo
-- pesa 17 KB. Esta vista nunca expone el array completo: solo la portada.
CREATE OR REPLACE VIEW vw_properties_list AS
SELECT
  p.id, p.address, p.neighborhood, p.city, p.property_type, p.operation_type,
  p.asking_price, p.currency, p.status, p.origin, p.created_at, p.updated_at,
  p.legal_status, p.assigned_to, p.rooms, p.bathrooms, p.covered_area, p.total_area,
  p.public_slug,
  -- Portada: photos[1]. Si es un base64 legacy devolvemos NULL para no arrastrar
  -- megas hasta el navegador; la UI muestra el placeholder. Se arregla de raíz
  -- migrando esas fotos a Storage (scripts/migrate-base64-photos.ts).
  CASE
    WHEN p.photos IS NULL OR array_length(p.photos, 1) IS NULL THEN NULL
    WHEN p.photos[1] LIKE 'data:%' THEN NULL
    ELSE p.photos[1]
  END AS thumbnail,
  COALESCE(array_length(p.photos, 1), 0) AS photo_count,
  -- Marca para poder detectar el legacy desde la UI sin traer el dato.
  COALESCE(p.photos[1] LIKE 'data:%', false) AS thumbnail_is_legacy_base64
FROM properties p;

COMMENT ON VIEW vw_properties_list IS 'Listado de propiedades SIN el array de fotos (99% del peso). Solo la portada y el conteo. El detalle sigue leyendo de `properties`.';

-- SEGURIDAD — no borrar estas tres líneas.
-- Una vista de Postgres corre por default con los permisos de SU DUEÑO, así que
-- SALTEA la RLS de la tabla de abajo. Sin `security_invoker`, esta vista dejaba
-- que la clave anónima —la que viaja en el bundle del navegador en la landing
-- pública— leyera las 41 propiedades con dirección, precio, estado interno y
-- asesor asignado, mientras `properties` devolvía [] correctamente. Verificado
-- con curl el 2026-07-31.
ALTER VIEW vw_properties_list SET (security_invoker = on);
REVOKE ALL ON vw_properties_list FROM anon;
GRANT SELECT ON vw_properties_list TO authenticated;
