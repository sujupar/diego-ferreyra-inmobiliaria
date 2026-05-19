-- Fase 3 — Capa de agregación SQL
-- Vistas que precomputan los eventos del embudo por día. Usadas por las RPCs
-- de la migración 20260518000004 y por reportes diario/semanal/mensual.

-- ============================================================================
-- vw_funnel_daily — Eventos del embudo CRM, una fila por fecha calendario.
-- ============================================================================
-- Las columnas representan eventos que ocurrieron EN esa fecha, no el estado
-- acumulado. Ej.: appraisal_requests=5 el 2026-05-10 = 5 deals con
-- origin<>'clase_gratuita' creados ese día.
CREATE OR REPLACE VIEW vw_funnel_daily AS
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
class_regs AS (
  SELECT created_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals
  WHERE origin = 'clase_gratuita'
  GROUP BY 1
),
appraisal_requests AS (
  SELECT created_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals
  WHERE (origin IS DISTINCT FROM 'clase_gratuita')
  GROUP BY 1
),
scheduled AS (
  SELECT scheduled_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals WHERE scheduled_at IS NOT NULL
  GROUP BY 1
),
visited AS (
  SELECT visited_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals WHERE visited_at IS NOT NULL
  GROUP BY 1
),
delivered AS (
  SELECT delivered_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals WHERE delivered_at IS NOT NULL
  GROUP BY 1
),
captured AS (
  SELECT captured_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals WHERE captured_at IS NOT NULL
  GROUP BY 1
),
lost AS (
  SELECT lost_at::date AS day, COUNT(*)::BIGINT AS n
  FROM deals WHERE lost_at IS NOT NULL
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

COMMENT ON VIEW vw_funnel_daily IS 'Fase 3 — Eventos del embudo CRM por fecha. Una fila por día calendario.';

-- ============================================================================
-- vw_meta_ads_funnel_daily — Meta Ads daily con clasificación de funnel.
-- ============================================================================
-- Clasifica cada campaña como clase_gratuita | tasacion | otro usando una
-- heurística sobre el nombre. Si el nombre no contiene "clase"/"curso" ni
-- "tasaci", queda 'otro' (visible en el dashboard como "Otras campañas").
CREATE OR REPLACE VIEW vw_meta_ads_funnel_daily AS
SELECT
  m.date AS day,
  m.campaign_id,
  m.campaign_name,
  m.impressions,
  m.clicks,
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

COMMENT ON VIEW vw_meta_ads_funnel_daily IS 'Fase 3 — Meta Ads daily clasificado por funnel_type (heurística por nombre de campaña).';
