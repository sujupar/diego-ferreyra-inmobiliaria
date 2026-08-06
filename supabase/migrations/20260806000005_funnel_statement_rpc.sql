-- =============================================================================
-- Estado de resultados del embudo (cascada por cohorte)
-- =============================================================================
-- El tablero anterior mostraba indicadores sueltos. Esto es una CASCADA: cada
-- línea explica la siguiente, como un estado de resultados. Se lee de arriba
-- abajo, de la inversión hasta las captaciones.
--
-- COHORTE, no eventos del período: se toman los deals CREADOS en el rango y se
-- sigue qué pasó con ELLOS. Es la única forma de que "de 109 solicitudes se
-- coordinaron 26" sea una afirmación verdadera; contando eventos sueltos, el
-- numerador y el denominador serían de poblaciones distintas.
--
-- El momento de "solicitud" es `deals.created_at`, no una fila del historial:
-- el deal nace como solicitud y esa transición no se registra.
-- =============================================================================

DROP FUNCTION IF EXISTS get_funnel_statement(DATE, DATE, TEXT[]);

CREATE OR REPLACE FUNCTION get_funnel_statement(
  p_from    DATE,
  p_to      DATE,
  p_origins TEXT[] DEFAULT ARRAY['embudo']
)
RETURNS TABLE (
  etapa        TEXT,
  orden        INT,
  cantidad     BIGINT,
  mediana_dias NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH etapas(etapa, orden, previa) AS (
    VALUES ('request',        1, NULL::text),
           ('scheduled',      2, 'request'),
           ('visited',        3, 'scheduled'),
           ('appraisal_sent', 4, 'visited'),
           ('captured',       5, 'appraisal_sent')
  ),
  cohorte AS (
    SELECT id, created_at
      FROM deals
     WHERE origin = ANY(p_origins)
       AND created_at::date BETWEEN p_from AND p_to
  ),
  puntos AS (
    -- El deal nace como solicitud: ese momento es created_at.
    SELECT c.id AS deal_id, 'request'::text AS etapa, c.created_at AS momento
      FROM cohorte c
    UNION ALL
    -- Primera vez que llegó a cada etapa (un deal puede volver atrás).
    SELECT h.deal_id, h.to_stage, min(h.changed_at)
      FROM deal_stage_history h
      JOIN cohorte c ON c.id = h.deal_id
     WHERE h.to_stage <> 'request'
     GROUP BY 1, 2
  )
  SELECT e.etapa,
         e.orden,
         count(DISTINCT p.deal_id)::bigint AS cantidad,
         round(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (p.momento - prev.momento)) / 86400.0)::numeric, 1) AS mediana_dias
    FROM etapas e
    LEFT JOIN puntos p    ON p.etapa = e.etapa
    LEFT JOIN puntos prev ON prev.deal_id = p.deal_id AND prev.etapa = e.previa
   GROUP BY e.etapa, e.orden
   ORDER BY e.orden;
$$;

COMMENT ON FUNCTION get_funnel_statement(DATE, DATE, TEXT[]) IS
  'Cascada del embudo por cohorte: cuántos llegaron a cada etapa y en cuántos días (mediana).';

GRANT EXECUTE ON FUNCTION get_funnel_statement(DATE, DATE, TEXT[]) TO authenticated;

-- Inversión desglosada por campaña, para la primera línea del estado de
-- resultados. Excluye las campañas de propiedad por el mismo criterio que
-- get_funnel_costs: si el campaign_id está en property_meta_campaigns, no es
-- del embudo de captación.
DROP FUNCTION IF EXISTS get_funnel_investment(DATE, DATE);

CREATE OR REPLACE FUNCTION get_funnel_investment(p_from DATE, p_to DATE)
RETURNS TABLE (campana TEXT, gasto NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(m.campaign_name, '(sin nombre)') AS campana,
         round(sum(m.spend), 0)                    AS gasto
    FROM meta_ads_daily m
   WHERE m.date BETWEEN p_from AND p_to
     AND NOT EXISTS (
           SELECT 1 FROM property_meta_campaigns c
            WHERE c.campaign_id = m.campaign_id)
   GROUP BY 1
  HAVING sum(m.spend) > 0
   ORDER BY 2 DESC;
$$;

COMMENT ON FUNCTION get_funnel_investment(DATE, DATE) IS
  'Inversión del embudo desglosada por campaña, para la primera línea del estado de resultados.';

GRANT EXECUTE ON FUNCTION get_funnel_investment(DATE, DATE) TO authenticated;
