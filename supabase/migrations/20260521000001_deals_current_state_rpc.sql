-- Métricas — vista "Estado actual del pipeline" (Opción B del usuario).
--
-- Esta RPC replica la lógica del CRM (lib/supabase/deals.ts:getDeals
-- stageCounts): deals CREADOS en el rango, agrupados por su stage ACTUAL.
-- Sirve para que el dashboard /metrics ofrezca números coincidentes 1:1
-- con las cards del CRM cuando el usuario filtra por la misma fecha.
--
-- NOTA: a diferencia de get_funnel_metrics (que filtra por origin del
-- embudo y mide eventos), esta función NO filtra por origin — incluye
-- todos los deals creados en el rango (referidos, históricos, etc.),
-- igual que el CRM. Por eso los conteos van a ser distintos a los del
-- embudo, y eso es intencional: cada vista responde una pregunta distinta.

CREATE OR REPLACE FUNCTION get_deals_current_state(p_from DATE, p_to DATE)
RETURNS TABLE (
  stage TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.stage::TEXT     AS stage,
    COUNT(*)::BIGINT  AS count
  FROM deals d
  WHERE d.created_at::date BETWEEN p_from AND p_to
  GROUP BY d.stage
  ORDER BY d.stage;
$$;

COMMENT ON FUNCTION get_deals_current_state(DATE, DATE) IS
  'Estado actual del pipeline: deals creados en el rango, agrupados por su stage actual. Coincide 1:1 con las cards del CRM.';

GRANT EXECUTE ON FUNCTION get_deals_current_state(DATE, DATE) TO authenticated;
