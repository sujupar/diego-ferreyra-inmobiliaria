-- Vista `consultas_unificadas`: una sola lista con las consultas de los portales
-- (`portal_inquiries`) y las de las landings (`property_leads` con source='landing'),
-- para la sección Consultas.
--
-- Aditiva: solo crea la vista y sus permisos; no toca ninguna tabla.
--
-- `security_invoker = true` es OBLIGATORIO: sin eso la vista corre con los
-- permisos de su dueño y cualquier usuario logueado leería todas las consultas
-- por la API REST, salteando la RLS por rol de las dos tablas de origen.
--
-- Landing válida = no borrada y no marcada como robot (`suspected_bot IS NOT TRUE`
-- y no `= false`: la columna admite NULL en filas viejas, y esas cuentan).

CREATE OR REPLACE VIEW public.consultas_unificadas
WITH (security_invoker = true) AS
SELECT
  pi.id,
  'portal'::text                               AS tipo,
  pi.seq::integer                              AS numero,
  COALESCE(pi.received_at, pi.created_at)      AS recibida_at,
  pi.inquiry_type                              AS canal,
  pi.portal                                    AS portal,
  pi.lead_name                                 AS nombre,
  pi.lead_phone                                AS telefono,
  pi.lead_email                                AS email,
  pi.lead_message                              AS mensaje,
  pi.property_id,
  pi.assigned_to,
  pr.assigned_to                               AS asesor_propiedad,
  pi.property_external_code                    AS aviso_codigo,
  pi.property_url                              AS aviso_url,
  pi.property_address                          AS aviso_direccion,
  pi.raw_subject                               AS aviso_titulo,
  NULL::jsonb                                  AS utm
FROM public.portal_inquiries pi
LEFT JOIN public.properties pr ON pr.id = pi.property_id

UNION ALL

SELECT
  pl.id,
  'landing'::text                              AS tipo,
  NULL::integer                                AS numero,
  pl.created_at                                AS recibida_at,
  'landing'::text                              AS canal,
  'landing'::text                              AS portal,
  pl.name                                      AS nombre,
  pl.phone                                     AS telefono,
  pl.email                                     AS email,
  pl.message                                   AS mensaje,
  pl.property_id,
  pl.assigned_to,
  pr.assigned_to                               AS asesor_propiedad,
  NULL::text                                   AS aviso_codigo,
  NULL::text                                   AS aviso_url,
  NULL::text                                   AS aviso_direccion,
  NULL::text                                   AS aviso_titulo,
  pl.utm                                       AS utm
FROM public.property_leads pl
LEFT JOIN public.properties pr ON pr.id = pl.property_id
WHERE pl.source = 'landing'
  AND pl.deleted_at IS NULL
  AND pl.suspected_bot IS NOT TRUE;

-- Los privilegios por defecto de Supabase le dan todo a `anon` en cada objeto
-- nuevo de `public`. Una consulta trae nombre, teléfono y email de una persona:
-- sin sesión no se lee nunca, aunque la RLS de las tablas ya lo frene.
REVOKE ALL ON public.consultas_unificadas FROM anon;
GRANT SELECT ON public.consultas_unificadas TO authenticated, service_role;
