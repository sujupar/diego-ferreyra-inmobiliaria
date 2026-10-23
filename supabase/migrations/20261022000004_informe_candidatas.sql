-- Competidoras que busca la plataforma para el informe quincenal (spec 2026-10-22 mejoras, tarea E).
--
-- `candidatas` guarda, por portal, el resultado de la búsqueda ({estado, error, buscadoEn, url, avisos[]}) y en
-- `detalles` lo que se leyó al abrir cada aviso (disposición, estado…), indexado por la URL del aviso. Argenprop y
-- MercadoLibre se buscan en pedidos separados (regla de Netlify) y los avisos se abren de a uno: cada escritura
-- toca SOLO su clave con jsonb_set dentro de un UPDATE (atómico), como `informe_guardar_fuente`.
-- Las elegidas por Paula siguen yendo a `competidoras` (lo que sale en el PDF).

ALTER TABLE public.property_reports
  ADD COLUMN IF NOT EXISTS candidatas JSONB NOT NULL DEFAULT '{"detalles": {}}'::jsonb;

ALTER TABLE public.property_reports DROP CONSTRAINT IF EXISTS property_reports_candidatas_objeto;
ALTER TABLE public.property_reports ADD CONSTRAINT property_reports_candidatas_objeto
  CHECK (jsonb_typeof(candidatas) = 'object');

-- p_camino: ['argenprop'] | ['mercadolibre'] | ['detalles', '<url del aviso>'].
CREATE OR REPLACE FUNCTION public.informe_guardar_candidatas(p_id UUID, p_camino TEXT[], p_valor JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_filas INT;
BEGIN
  IF array_length(p_camino, 1) IS NULL
     OR NOT (
       (array_length(p_camino, 1) = 1 AND p_camino[1] IN ('argenprop', 'mercadolibre'))
       OR (array_length(p_camino, 1) = 2 AND p_camino[1] = 'detalles' AND p_camino[2] LIKE 'https://%')
     ) THEN
    RAISE EXCEPTION 'informe_guardar_candidatas: camino inválido %', p_camino;
  END IF;
  IF jsonb_typeof(p_valor) <> 'object' THEN
    RAISE EXCEPTION 'informe_guardar_candidatas: el valor tiene que ser un objeto';
  END IF;
  UPDATE public.property_reports
     SET candidatas = jsonb_set(
           -- `detalles` siempre existe: jsonb_set solo crea la ÚLTIMA clave del camino.
           candidatas || jsonb_build_object('detalles', COALESCE(candidatas -> 'detalles', '{}'::jsonb)),
           p_camino, p_valor, true),
         updated_at = now()
   WHERE id = p_id AND estado = 'borrador';
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.informe_guardar_candidatas(UUID, TEXT[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.informe_guardar_candidatas(UUID, TEXT[], JSONB) TO service_role;
