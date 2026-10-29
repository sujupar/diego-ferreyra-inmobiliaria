-- Función `consultas_del_periodo`: TODO lo que la sección Consultas necesita de un
-- período, en UN solo viaje a la base (spec 2026-10-29-consultas-rapidas-y-estadisticas).
--
-- Por qué una función y no varias lecturas: cada pedido a la plataforma ya cuesta
-- ~1 s de piso, y la bandeja hacía hasta cuatro lecturas en dos tandas (consultas,
-- visitas, direcciones y asesores). Las REGLAS (estado, teléfono del 549, filtros)
-- siguen en TypeScript (`lib/consultas/bandeja.ts`): acá solo se junta el dato.
--
-- Devuelve un único jsonb (el tope de 1000 filas de PostgREST no aplica):
--   consultas   filas de `consultas_unificadas`, más nuevas primero (recibida_at desc, id desc)
--   visitas     no canceladas que pueden ser de esas consultas (por vínculo o por propiedad)
--   propiedades id, dirección y barrio de las propiedades de esas consultas
--   asesores    id y nombre de los asesores de esas consultas
--   truncado    true si el período tenía más de `p_limite` consultas
--
-- Alcance: `p_usuario` NULL = todo (operaciones). Con un id, solo las consultas
-- asignadas a esa persona o de propiedades suyas — la MISMA regla que la Entrega 1.
-- Ese parámetro lo fija SIEMPRE el servidor con el usuario de la sesión; por eso
-- la función solo la puede ejecutar `service_role`: un usuario logueado que la
-- llamara por la API REST elegiría su propio alcance.
--
-- SECURITY INVOKER: corre con los permisos de quien llama (service_role).

CREATE OR REPLACE FUNCTION public.consultas_del_periodo(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_usuario uuid DEFAULT NULL,
  p_limite integer DEFAULT 3000
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH
  -- Una de más para saber si el período quedó cortado.
  candidatas AS (
    SELECT *
    FROM consultas_unificadas
    WHERE recibida_at >= p_desde
      AND recibida_at <= p_hasta
      AND (p_usuario IS NULL OR assigned_to = p_usuario OR asesor_propiedad = p_usuario)
    ORDER BY recibida_at DESC, id DESC
    LIMIT GREATEST(p_limite, 1) + 1
  ),
  dentro AS (
    SELECT * FROM candidatas ORDER BY recibida_at DESC, id DESC LIMIT GREATEST(p_limite, 1)
  ),
  props AS (
    SELECT DISTINCT property_id FROM dentro WHERE property_id IS NOT NULL
  ),
  -- Las de landing no necesitan buscarse por `lead_id`: `property_leads.property_id`
  -- es NOT NULL, así que su visita ya viene por la propiedad.
  visitas AS (
    SELECT pv.id, pv.property_id, pv.portal_inquiry_id, pv.lead_id, pv.client_phone, pv.status, pv.scheduled_at
    FROM property_visits pv
    WHERE pv.status <> 'cancelled'
      AND (
        pv.property_id IN (SELECT property_id FROM props)
        OR pv.portal_inquiry_id IN (SELECT id FROM dentro WHERE tipo = 'portal')
      )
  )
  SELECT jsonb_build_object(
    'consultas', COALESCE(
      (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.recibida_at DESC, d.id DESC) FROM dentro d), '[]'::jsonb),
    'visitas', COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM visitas v), '[]'::jsonb),
    'propiedades', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'address', p.address, 'neighborhood', p.neighborhood))
         FROM properties p WHERE p.id IN (SELECT property_id FROM props)), '[]'::jsonb),
    'asesores', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name))
         FROM profiles pr
        WHERE pr.id IN (SELECT asesor_propiedad FROM dentro UNION SELECT assigned_to FROM dentro)), '[]'::jsonb),
    'truncado', (SELECT count(*) FROM candidatas) > GREATEST(p_limite, 1)
  );
$$;

REVOKE ALL ON FUNCTION public.consultas_del_periodo(timestamptz, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultas_del_periodo(timestamptz, timestamptz, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultas_del_periodo(timestamptz, timestamptz, uuid, integer) TO service_role;
