-- Guarda UNA fuente automática de un informe sin pisar las demás (plan tarea 5).
--
-- Las fuentes se piden de a una (una por request, regla de Netlify) y pueden llegar a la vez
-- (Paula toca "Reintentar" mientras corre el cron). Un leer-modificar-escribir desde JS perdería
-- una de las dos; `jsonb_set` dentro de un UPDATE es atómico. Solo service role (lo llama el servidor).
-- No toca un informe ya "listo": su PDF está generado con los datos de ese momento.

CREATE OR REPLACE FUNCTION public.informe_guardar_fuente(p_id UUID, p_fuente TEXT, p_valor JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_filas INT;
BEGIN
  IF p_fuente NOT IN ('consultas', 'visitas', 'reserva', 'mercadolibre', 'meta', 'instagram') THEN
    RAISE EXCEPTION 'informe_guardar_fuente: fuente desconocida "%"', p_fuente;
  END IF;
  IF jsonb_typeof(p_valor) <> 'object' THEN
    RAISE EXCEPTION 'informe_guardar_fuente: el valor tiene que ser un objeto';
  END IF;
  UPDATE public.property_reports
     SET fuentes = jsonb_set(fuentes, ARRAY[p_fuente], p_valor, true),
         updated_at = now()
   WHERE id = p_id AND estado = 'borrador';
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.informe_guardar_fuente(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.informe_guardar_fuente(UUID, TEXT, JSONB) TO service_role;
