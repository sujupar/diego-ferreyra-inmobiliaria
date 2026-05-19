-- Fase 3 — RPCs para consumir las vistas con rango de fechas desde la API.
-- Una RPC por consulta principal del dashboard.

-- ============================================================================
-- get_funnel_metrics(from, to) → un valor por métrica para el rango.
-- ============================================================================
-- Útil para "tarjetas" del dashboard y para reportes que muestran totales.
CREATE OR REPLACE FUNCTION get_funnel_metrics(p_from DATE, p_to DATE)
RETURNS TABLE (
  metric TEXT,
  value  BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 'class_registrations'::TEXT,    COALESCE(SUM(class_registrations), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'appraisal_requests',           COALESCE(SUM(appraisal_requests), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'appointments_scheduled',       COALESCE(SUM(appointments_scheduled), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'visits_completed',             COALESCE(SUM(visits_completed), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'appraisals_delivered',         COALESCE(SUM(appraisals_delivered), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'properties_captured',          COALESCE(SUM(properties_captured), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'deals_lost',                   COALESCE(SUM(deals_lost), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to;
$$;

COMMENT ON FUNCTION get_funnel_metrics(DATE, DATE) IS 'Fase 3 — Totales del embudo CRM para un rango. Retorna 7 filas (una por métrica).';

-- ============================================================================
-- get_meta_funnel_by_campaign(from, to) → totales por campaña Meta en el rango.
-- ============================================================================
-- Agrega campañas por id, con CTR y costo/registro recomputados sobre los totales
-- del rango (no promedios de diarios — eso sería incorrecto).
CREATE OR REPLACE FUNCTION get_meta_funnel_by_campaign(p_from DATE, p_to DATE)
RETURNS TABLE (
  campaign_id           TEXT,
  campaign_name         TEXT,
  funnel_type           TEXT,
  impressions           BIGINT,
  clicks                BIGINT,
  ctr                   NUMERIC,
  spend                 NUMERIC,
  registrations         BIGINT,
  cost_per_registration NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    campaign_id,
    MAX(campaign_name) AS campaign_name,
    MAX(funnel_type)   AS funnel_type,
    COALESCE(SUM(impressions), 0)::BIGINT AS impressions,
    COALESCE(SUM(clicks), 0)::BIGINT       AS clicks,
    CASE
      WHEN COALESCE(SUM(impressions), 0) > 0
      THEN ROUND((SUM(clicks)::NUMERIC / SUM(impressions)) * 100, 2)
      ELSE 0
    END AS ctr,
    COALESCE(SUM(spend), 0)::NUMERIC      AS spend,
    COALESCE(SUM(registrations), 0)::BIGINT AS registrations,
    CASE
      WHEN COALESCE(SUM(registrations), 0) > 0
      THEN ROUND(SUM(spend)::NUMERIC / SUM(registrations), 2)
      ELSE NULL
    END AS cost_per_registration
  FROM vw_meta_ads_funnel_daily
  WHERE day BETWEEN p_from AND p_to
  GROUP BY campaign_id
  ORDER BY SUM(spend) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION get_meta_funnel_by_campaign(DATE, DATE) IS 'Fase 3 — Totales por campaña Meta en un rango. CTR y CPR recomputados, no promediados.';

-- ============================================================================
-- get_funnel_metrics_by_day(from, to) → serie temporal del embudo.
-- ============================================================================
-- Una fila por día. Útil para gráficos de evolución.
CREATE OR REPLACE FUNCTION get_funnel_metrics_by_day(p_from DATE, p_to DATE)
RETURNS SETOF vw_funnel_daily
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM vw_funnel_daily
  WHERE day BETWEEN p_from AND p_to
  ORDER BY day;
$$;

COMMENT ON FUNCTION get_funnel_metrics_by_day(DATE, DATE) IS 'Fase 3 — Serie diaria del embudo para gráficos de evolución.';

-- Permisos: usuarios autenticados pueden ejecutar (la RLS de las tablas
-- subyacentes filtra a nivel de fila).
GRANT EXECUTE ON FUNCTION get_funnel_metrics(DATE, DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION get_meta_funnel_by_campaign(DATE, DATE)   TO authenticated;
GRANT EXECUTE ON FUNCTION get_funnel_metrics_by_day(DATE, DATE)     TO authenticated;
