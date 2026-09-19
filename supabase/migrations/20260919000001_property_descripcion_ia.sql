-- Caché del generador de descripciones con el método de Diego (2026-09-19).
-- Guarda lo que cuesta plata y tiempo repetir —el inventario de las fotos y la
-- investigación de la zona, cada uno con una firma para saber si sigue valiendo—,
-- las notas del asesor ("lo que no se ve en las fotos") y un respaldo de las
-- descripciones reemplazadas. Aditiva y nullable: no rompe el código deployado.
-- Shape: DescripcionIA en lib/descripcion/tipos.ts.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS descripcion_ia jsonb;

COMMENT ON COLUMN public.properties.descripcion_ia IS
  'Caché del generador de descripciones (método de Diego): inventario de fotos, zona, notas del asesor y respaldo de descripciones reemplazadas. Shape: DescripcionIA en lib/descripcion/tipos.ts';
