-- Recorridos de colectivo en el mapa propio (2026-09-19).
--
-- POR QUÉ: contar solo las paradas cargadas en OpenStreetMap dejaba afuera
-- líneas que pasan cerca, porque a muchas rutas les faltan las paradas: Perón
-- 4227 perdía la 19 y la 109 contra la consulta en vivo, Doblas 248 la 25 y la
-- 145. La consulta en vivo (`rel(around:400)[route=bus]`) cuenta toda ruta con
-- algún miembro a 400 m, parada O tramo. Ahora el mapa propio guarda también los
-- tramos (tipo 'recorrido') con su trazado, y PostGIS mide la distancia al punto
-- más cercano de la calle por donde pasa.
--
-- `ubicacion` pasa de "solo puntos" a cualquier geometría: los puntos que ya
-- están siguen siendo puntos. `lugares_cercanos` no cambia: ST_DWithin y
-- ST_Distance sobre geography funcionan igual con líneas. Idempotente.

ALTER TABLE public.mapa_lugares
  ALTER COLUMN ubicacion TYPE extensions.geography(Geometry, 4326);

ALTER TABLE public.mapa_lugares DROP CONSTRAINT IF EXISTS mapa_lugares_tipo_check;
ALTER TABLE public.mapa_lugares ADD CONSTRAINT mapa_lugares_tipo_check
  CHECK (tipo IN ('subte', 'tren', 'plaza', 'colegio', 'universidad', 'hospital', 'parada', 'recorrido'));
