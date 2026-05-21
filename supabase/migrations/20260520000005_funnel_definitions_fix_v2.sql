-- HOTFIX — Re-aplicar 20260520000004 con DROP FUNCTION previos.
--
-- Postgres no permite cambiar el tipo de retorno de una función vía
-- CREATE OR REPLACE. El SQL anterior falló con 42P13 al intentar redefinir
-- get_meta_funnel_by_campaign con la nueva columna landing_page_views.
--
-- Este script:
--   1. DROPea explícitamente las funciones que cambian de signature.
--   2. Re-aplica el resto idénticamente.
--
-- Es idempotente: se puede correr aunque 20260520000004 haya fallado a
-- mitad — todo va con CREATE OR REPLACE / DROP IF EXISTS.

-- ============================================================================
-- 0) Drop functions que cambian de signature (deben ir ANTES del CREATE).
-- ============================================================================
DROP FUNCTION IF EXISTS get_meta_funnel_by_campaign(DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_funnel_metrics(DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_funnel_metrics_by_day(DATE, DATE) CASCADE;

-- ============================================================================
-- 1) vw_funnel_daily — versión corregida.
-- ============================================================================
DROP VIEW IF EXISTS vw_funnel_daily CASCADE;

CREATE VIEW vw_funnel_daily AS
WITH date_bounds AS (
  SELECT
    LEAST(
      COALESCE((SELECT MIN(created_at)::date FROM deals), CURRENT_DATE),
      CURRENT_DATE - INTERVAL '30 days'
    )::date AS d_min,
    CURRENT_DATE AS d_max
),
dates AS (
  SELECT generate_series(d_min, d_max, INTERVAL '1 day')::date AS day FROM date_bounds
),
-- Registros a la clase gratuita: deals creados con origin='clase_gratuita'.
class_regs AS (
  SELECT created_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals
  WHERE origin = 'clase_gratuita'
  GROUP BY 1
),
-- Solicitudes de tasación: SOLO los del embudo (registros directos vía GHL form).
-- Excluye 'referido', 'historico', 'comprador', NULL, etc.
appraisal_requests AS (
  SELECT created_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals
  WHERE origin = 'embudo'
  GROUP BY 1
),
-- Eventos del embudo: restringido a deals del embudo de marketing
-- (excluye 'referido', 'historico', 'comprador', NULL).
funnel_deals AS (
  SELECT * FROM deals WHERE origin IN ('embudo','clase_gratuita')
),
scheduled AS (
  SELECT scheduled_at::date AS day, COUNT(*)::BIGINT AS n
  FROM funnel_deals WHERE scheduled_at IS NOT NULL
  GROUP BY 1
),
visited AS (
  SELECT visited_at::date AS day, COUNT(*)::BIGINT AS n
  FROM funnel_deals WHERE visited_at IS NOT NULL
  GROUP BY 1
),
delivered AS (
  SELECT delivered_at::date AS day, COUNT(*)::BIGINT AS n
  FROM funnel_deals WHERE delivered_at IS NOT NULL
  GROUP BY 1
),
captured AS (
  SELECT captured_at::date AS day, COUNT(*)::BIGINT AS n
  FROM funnel_deals WHERE captured_at IS NOT NULL
  GROUP BY 1
),
lost AS (
  SELECT lost_at::date AS day, COUNT(*)::BIGINT AS n
  FROM funnel_deals WHERE lost_at IS NOT NULL
  GROUP BY 1
)
SELECT
  d.day,
  COALESCE(cr.n, 0)  AS class_registrations,
  COALESCE(ar.n, 0)  AS appraisal_requests,
  COALESCE(s.n, 0)   AS appointments_scheduled,
  COALESCE(v.n, 0)   AS visits_completed,
  COALESCE(dl.n, 0)  AS appraisals_delivered,
  COALESCE(c.n, 0)   AS properties_captured,
  COALESCE(l.n, 0)   AS deals_lost
FROM dates d
LEFT JOIN class_regs cr         ON cr.day = d.day
LEFT JOIN appraisal_requests ar ON ar.day = d.day
LEFT JOIN scheduled s           ON s.day  = d.day
LEFT JOIN visited v             ON v.day  = d.day
LEFT JOIN delivered dl          ON dl.day = d.day
LEFT JOIN captured c            ON c.day  = d.day
LEFT JOIN lost l                ON l.day  = d.day;

COMMENT ON VIEW vw_funnel_daily IS
  'Eventos del embudo de marketing por día. Solicitudes de tasación = origin=embudo (excluye referidos/históricos/comprador/NULL). Eventos (agendadas/visitas/etc.) restringidos a origin IN (embudo, clase_gratuita).';

-- ============================================================================
-- 2) get_funnel_metrics / get_funnel_metrics_by_day RPCs.
-- ============================================================================
CREATE FUNCTION get_funnel_metrics(p_from DATE, p_to DATE)
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

CREATE FUNCTION get_funnel_metrics_by_day(p_from DATE, p_to DATE)
RETURNS SETOF vw_funnel_daily
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM vw_funnel_daily
  WHERE day BETWEEN p_from AND p_to
  ORDER BY day;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_metrics(DATE, DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION get_funnel_metrics_by_day(DATE, DATE)     TO authenticated;

-- ============================================================================
-- 3) vw_meta_ads_funnel_daily — agregar landing_page_views a la vista.
-- ============================================================================
DROP VIEW IF EXISTS vw_meta_ads_funnel_daily CASCADE;

CREATE VIEW vw_meta_ads_funnel_daily AS
SELECT
  m.date AS day,
  m.campaign_id,
  m.campaign_name,
  m.impressions,
  m.clicks,
  m.landing_page_views,
  m.ctr,
  m.spend,
  m.leads AS registrations,
  m.cost_per_lead,
  CASE
    WHEN LOWER(COALESCE(m.campaign_name, '')) LIKE '%clase%'
      OR LOWER(COALESCE(m.campaign_name, '')) LIKE '%curso%'
      THEN 'clase_gratuita'
    WHEN LOWER(COALESCE(m.campaign_name, '')) LIKE '%tasaci%'
      THEN 'tasacion'
    ELSE 'otro'
  END AS funnel_type
FROM meta_ads_daily m;

-- ============================================================================
-- 4) get_meta_funnel_by_campaign — devolver landing_page_views.
-- ============================================================================
CREATE FUNCTION get_meta_funnel_by_campaign(p_from DATE, p_to DATE)
RETURNS TABLE (
  campaign_id           TEXT,
  campaign_name         TEXT,
  funnel_type           TEXT,
  impressions           BIGINT,
  clicks                BIGINT,
  landing_page_views    BIGINT,
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
    COALESCE(SUM(impressions), 0)::BIGINT             AS impressions,
    COALESCE(SUM(clicks), 0)::BIGINT                  AS clicks,
    COALESCE(SUM(landing_page_views), 0)::BIGINT      AS landing_page_views,
    CASE
      WHEN COALESCE(SUM(impressions), 0) > 0
      THEN ROUND((SUM(landing_page_views)::NUMERIC / SUM(impressions)) * 100, 2)
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

GRANT EXECUTE ON FUNCTION get_meta_funnel_by_campaign(DATE, DATE) TO authenticated;
