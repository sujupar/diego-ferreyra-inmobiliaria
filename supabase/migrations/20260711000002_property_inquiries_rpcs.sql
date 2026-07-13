-- =============================================================================
-- RPCs de métricas de consultas por propiedad
-- =============================================================================
-- Patrón idéntico a 20260518000004_metrics_rpcs.sql: get_*(p_from, p_to),
-- LANGUAGE sql STABLE, GRANT a authenticated (la RLS de las tablas subyacentes
-- filtra a nivel de fila; el gate de negocio es requirePermission('metrics.view')
-- en la ruta API). Conteo query-time sobre la FK indexada — sin rollup (decisión
-- del spec: exacto, sin sincronización; el rollup se agrega detrás de la MISMA
-- RPC si el volumen algún día lo exige).
-- Base temporal: COALESCE(received_at, created_at)::date (received_at = cuándo
-- consultó el lead; created_at = fallback si el parseo no trajo fecha).
-- =============================================================================

-- Regla del proyecto: DROP previo por si cambia el return type en el futuro.
DROP FUNCTION IF EXISTS get_property_inquiry_counts(DATE, DATE);

CREATE FUNCTION get_property_inquiry_counts(p_from DATE, p_to DATE)
RETURNS TABLE (
  property_id     uuid,
  address         text,
  neighborhood    text,
  assigned_to     uuid,
  total           bigint,
  mercadolibre    bigint,
  argenprop       bigint,
  zonaprop        bigint,
  last_inquiry_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT pi.property_id,
         p.address,
         p.neighborhood,
         p.assigned_to,
         COUNT(*)::bigint                                            AS total,
         COUNT(*) FILTER (WHERE pi.portal = 'mercadolibre')::bigint  AS mercadolibre,
         COUNT(*) FILTER (WHERE pi.portal = 'argenprop')::bigint     AS argenprop,
         COUNT(*) FILTER (WHERE pi.portal = 'zonaprop')::bigint      AS zonaprop,
         MAX(COALESCE(pi.received_at, pi.created_at))                AS last_inquiry_at
    FROM public.portal_inquiries pi
    JOIN public.properties p ON p.id = pi.property_id
   WHERE pi.property_id IS NOT NULL
     AND COALESCE(pi.received_at, pi.created_at)::date BETWEEN p_from AND p_to
   GROUP BY pi.property_id, p.address, p.neighborhood, p.assigned_to
   ORDER BY total DESC;
$$;

COMMENT ON FUNCTION get_property_inquiry_counts(DATE, DATE) IS
  'Consultas de portales por propiedad en el rango (una fila por propiedad con >=1 consulta), con desglose por portal.';

DROP FUNCTION IF EXISTS get_inquiries_summary(DATE, DATE);

CREATE FUNCTION get_inquiries_summary(p_from DATE, p_to DATE)
RETURNS TABLE (metric text, value bigint)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT portal, property_id
      FROM public.portal_inquiries
     WHERE COALESCE(received_at, created_at)::date BETWEEN p_from AND p_to
  )
  SELECT 'total'::text,        COUNT(*)::bigint                                        FROM base
  UNION ALL
  SELECT 'matched',            COUNT(*) FILTER (WHERE property_id IS NOT NULL)::bigint FROM base
  UNION ALL
  SELECT 'unidentified',       COUNT(*) FILTER (WHERE property_id IS NULL)::bigint     FROM base
  UNION ALL
  SELECT 'mercadolibre',       COUNT(*) FILTER (WHERE portal = 'mercadolibre')::bigint FROM base
  UNION ALL
  SELECT 'argenprop',          COUNT(*) FILTER (WHERE portal = 'argenprop')::bigint    FROM base
  UNION ALL
  SELECT 'zonaprop',           COUNT(*) FILTER (WHERE portal = 'zonaprop')::bigint     FROM base;
$$;

COMMENT ON FUNCTION get_inquiries_summary(DATE, DATE) IS
  'Escalares del período para las tarjetas resumen: total, identificadas (property_id NOT NULL), sin identificar, y por portal.';

-- Permisos: usuarios autenticados pueden ejecutar (la RLS de las tablas
-- subyacentes filtra a nivel de fila).
GRANT EXECUTE ON FUNCTION get_property_inquiry_counts(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inquiries_summary(DATE, DATE)       TO authenticated;

-- =============================================================================
-- Verificación (correr a mano tras aplicar):
--   SELECT * FROM get_inquiries_summary('2026-06-01', '2026-07-31');
--   SELECT * FROM get_property_inquiry_counts('2026-06-01', '2026-07-31') LIMIT 10;
-- =============================================================================
