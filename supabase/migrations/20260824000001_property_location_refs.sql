-- La ubicación de una propiedad se ELIGE de una lista, no se escribe.
--
-- `location_refs` guarda los identificadores REALES del catálogo del portal
-- para la ubicación elegida. Sin esto, publicar depende de emparejar textos
-- ("General San Martín" vs "Partido de General San Martín" vs la localidad
-- "General San Martin" sin tilde), y ante la duda el emparejador se planta a
-- propósito: publicar en el partido equivocado manda el aviso a 90 km.
--
-- Forma: { "argenprop": { provinciaId, provinciaNombre, partidoId, partidoNombre,
--                         localidadId, localidadNombre, barrioId, barrioNombre } }
-- Se abre por portal para que ZonaProp/MercadoLibre puedan sumar el suyo sin
-- otra migración. Las columnas province/city/neighborhood siguen siendo las que
-- se leen en pantalla; esto es el vínculo con el catálogo del portal.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS location_refs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN properties.location_refs IS
  'Identificadores de la ubicación en el catálogo de cada portal, por portal. Ej: {"argenprop":{"localidadId":"LOCALIDAD_928","barrioId":"BARRIO_323",...}}. Lo escribe el selector de ubicación (lib/properties/location-selection.ts).';
