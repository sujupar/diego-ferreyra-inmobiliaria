-- Enlaces públicos anteriores de una propiedad.
--
-- POR QUÉ: el slug se arma con el tipo de propiedad
-- (`casa-coghlan-roque-perez-3059-37ger2`) y queda congelado al publicar. Si el
-- tipo estaba mal cargado, corregirlo cambia la URL — y la vieja ya vive dentro
-- de anuncios pagos, mensajes y mails. `/p/[slug]` resuelve por coincidencia
-- EXACTA, así que sin este registro el enlace viejo pasaría a dar 404 con pauta
-- encima. Guardándolo acá, la página lo redirige al vigente conservando los
-- parámetros de seguimiento (utm_*, fbclid) para no perder la atribución.
--
-- Aplicada y verificada en producción el 2026-08-24.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS previous_slugs text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_properties_previous_slugs
  ON public.properties USING GIN (previous_slugs);

COMMENT ON COLUMN public.properties.previous_slugs IS
  'Enlaces publicos anteriores. /p/[slug] los resuelve con redireccion permanente al slug vigente, para no matar links que ya viven en anuncios pagos, mensajes y mails.';
