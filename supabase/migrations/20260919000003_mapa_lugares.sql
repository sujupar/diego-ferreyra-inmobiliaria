-- Mapa propio para las descripciones (2026-09-19).
--
-- POR QUÉ: la etapa de zona consultaba en vivo a servidores públicos gratuitos de
-- OpenStreetMap (Overpass). Sin garantía: en producción falló 1 de 5, y medido
-- contra Hipólito Yrigoyen 1550 devolvieron 429 ("demasiados pedidos"), 504 y
-- esperas de 30 s; en una ronda fallaron los dos servidores a la vez. Limitan por
-- IP y Netlify comparte IP con miles de sitios. Ver el spec
-- docs/superpowers/specs/2026-09-19-mapa-propio-design.md.
--
-- AHORA: los lugares del AMBA (estaciones con líneas, paradas con líneas de
-- colectivo, plazas, colegios, universidades, hospitales; ~30.000 filas) viven
-- acá. La consulta de la descripción no sale de la base. Se cargan y refrescan
-- por celdas de 0,05° (scripts/mapa-cargar.ts y la ruta /api/cron/mapa-lugares).
-- Aditiva: no cambia nada existente.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Grilla del AMBA. `actualizado_en` = última descarga BUENA: si una descarga
-- falla, la celda conserva sus datos anteriores y queda en 'error' para reintentar.
CREATE TABLE IF NOT EXISTS public.mapa_celdas (
  id             TEXT PRIMARY KEY,               -- esquina sur-oeste: '-34.600_-58.400'
  sur            DOUBLE PRECISION NOT NULL,
  oeste          DOUBLE PRECISION NOT NULL,
  norte          DOUBLE PRECISION NOT NULL,
  este           DOUBLE PRECISION NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'ok', 'error')),
  filas          INTEGER NOT NULL DEFAULT 0,
  intentos       INTEGER NOT NULL DEFAULT 0,
  ultimo_error   TEXT,
  actualizado_en TIMESTAMPTZ,
  intentado_en   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mapa_celdas_antiguedad ON public.mapa_celdas (actualizado_en NULLS FIRST);

CREATE TABLE IF NOT EXISTS public.mapa_lugares (
  osm_id         TEXT NOT NULL,                  -- 'n123' | 'w456' | 'r789'
  tipo           TEXT NOT NULL CHECK (tipo IN ('subte', 'tren', 'plaza', 'colegio', 'universidad', 'hospital', 'parada')),
  nombre         TEXT NOT NULL DEFAULT '',
  lineas         TEXT[] NOT NULL DEFAULT '{}',
  ubicacion      extensions.geography(Point, 4326) NOT NULL,
  celda          TEXT NOT NULL REFERENCES public.mapa_celdas(id) ON DELETE CASCADE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (osm_id, tipo)
);
CREATE INDEX IF NOT EXISTS idx_mapa_lugares_ubicacion ON public.mapa_lugares USING gist (ubicacion);
CREATE INDEX IF NOT EXISTS idx_mapa_lugares_celda ON public.mapa_lugares (celda);

-- Sin políticas: solo el servidor (service role). No hay nada acá que el
-- navegador tenga que leer.
ALTER TABLE public.mapa_celdas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_lugares ENABLE ROW LEVEL SECURITY;

-- Lugares dentro de un radio POR TIPO (los radios los manda el código, que es
-- donde viven: lib/descripcion/zona-mapa.ts). El índice GiST filtra por el radio
-- mayor; después se aplica el de cada tipo.
CREATE OR REPLACE FUNCTION public.lugares_cercanos(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_radios JSONB)
RETURNS TABLE (osm_id TEXT, tipo TEXT, nombre TEXT, lineas TEXT[], metros INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH punto AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
  ), radio_max AS (
    SELECT coalesce(max((value #>> '{}')::double precision), 0) AS m FROM jsonb_each(p_radios)
  )
  SELECT l.osm_id, l.tipo, l.nombre, l.lineas, round(ST_Distance(l.ubicacion, punto.g))::int AS metros
  FROM public.mapa_lugares l, punto, radio_max
  WHERE ST_DWithin(l.ubicacion, punto.g, radio_max.m)
    AND ST_Distance(l.ubicacion, punto.g) <= coalesce((p_radios ->> l.tipo)::double precision, 0)
  ORDER BY metros;
$$;

REVOKE ALL ON FUNCTION public.lugares_cercanos(DOUBLE PRECISION, DOUBLE PRECISION, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lugares_cercanos(DOUBLE PRECISION, DOUBLE PRECISION, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.lugares_cercanos(DOUBLE PRECISION, DOUBLE PRECISION, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lugares_cercanos(DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO service_role;

COMMENT ON TABLE public.mapa_lugares IS
  'Lugares del AMBA desde OpenStreetMap para la zona de las descripciones (estaciones y paradas con líneas, plazas, colegios, universidades, hospitales). Se carga por celdas: scripts/mapa-cargar.ts y /api/cron/mapa-lugares.';
