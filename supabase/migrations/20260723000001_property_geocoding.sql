-- Geocoding: provincia normalizada + confianza del pin + timestamp de geocodificación.
-- La tabla `properties` fue creada fuera de migraciones; ALTER ADD funciona igual.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geo_confidence TEXT;   -- 'high' | 'medium' | 'low' | 'manual'
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

COMMENT ON COLUMN properties.province IS 'Provincia/región normalizada: CABA, Buenos Aires, u otra. Fuente de verdad de región para geocoding y portales.';
COMMENT ON COLUMN properties.geo_confidence IS 'Confianza del pin: high|medium|low (geocoder) o manual (confirmado por humano).';
COMMENT ON COLUMN properties.geocoded_at IS 'Cuándo se geocodificó (distingue backfill de pin manual).';
