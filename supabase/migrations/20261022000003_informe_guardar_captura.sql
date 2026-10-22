-- Guarda o quita UNA captura de un informe sin pisar las demás (hallazgo de la revisión adversarial).
--
-- Antes la ruta leía `capturas` entero, le cambiaba una clave y lo reescribía: subir la de Zonaprop y
-- la de Argenprop a la vez dejaba solo una (la otra quedaba huérfana en el bucket). Acá se toma la
-- fila con FOR UPDATE, se cambia SOLO esa clave y se devuelve la captura anterior, para que el
-- servidor borre el archivo viejo. p_path NULL = quitar. Solo borradores. Solo service role.

CREATE OR REPLACE FUNCTION public.informe_guardar_captura(p_id UUID, p_cual TEXT, p_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_capturas JSONB;
  v_anterior TEXT;
BEGIN
  IF p_cual NOT IN ('zonaprop', 'argenprop', 'mercadolibre', 'tiktok') THEN
    RAISE EXCEPTION 'informe_guardar_captura: captura desconocida "%"', p_cual;
  END IF;
  SELECT capturas INTO v_capturas FROM public.property_reports
   WHERE id = p_id AND estado = 'borrador' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_anterior := v_capturas ->> p_cual;
  IF p_path IS NULL THEN
    v_capturas := v_capturas - p_cual;
  ELSE
    v_capturas := jsonb_set(v_capturas, ARRAY[p_cual], to_jsonb(p_path), true);
  END IF;
  UPDATE public.property_reports SET capturas = v_capturas, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('capturas', v_capturas, 'anterior', v_anterior);
END;
$$;

REVOKE ALL ON FUNCTION public.informe_guardar_captura(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.informe_guardar_captura(UUID, TEXT, TEXT) TO service_role;
