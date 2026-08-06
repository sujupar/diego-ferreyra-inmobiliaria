-- =============================================================================
-- Costo por etapa del embudo de captación
-- =============================================================================
-- Inversión DEL EMBUDO, no la de promocionar propiedades ya captadas: una
-- campaña es "de propiedad" si su campaign_id figura en property_meta_campaigns.
-- La separación es por DATO y no por nombre de campaña, que hoy alcanzaría
-- ("Tasación Gratuita", "Clase Gratuita") pero se rompe al renombrar una.
--
-- Devuelve dias_con_dato y dias_del_periodo porque la app MUESTRA la cobertura
-- junto al costo: al 2026-08-06 la tabla tiene 24 días de 88, así que un costo
-- sin su cobertura sería un número con cara de verdad. Ver el spec, §4.
-- =============================================================================

DROP FUNCTION IF EXISTS get_funnel_costs(DATE, DATE);

CREATE OR REPLACE FUNCTION get_funnel_costs(p_from DATE, p_to DATE)
RETURNS TABLE (
  inversion         NUMERIC,
  solicitudes       BIGINT,
  tasaciones        BIGINT,
  captaciones       BIGINT,
  costo_solicitud   NUMERIC,
  costo_tasacion    NUMERIC,
  costo_captacion   NUMERIC,
  dias_con_dato     INT,
  dias_del_periodo  INT
)
LANGUAGE sql
STABLE
AS $$
  WITH gasto AS (
    SELECT coalesce(sum(m.spend), 0)::numeric AS total,
           count(DISTINCT m.date)::int        AS dias
      FROM meta_ads_daily m
     WHERE m.date BETWEEN p_from AND p_to
       AND NOT EXISTS (
             SELECT 1 FROM property_meta_campaigns c
              WHERE c.campaign_id = m.campaign_id)
  ),
  sol AS (
    SELECT count(*)::bigint AS n FROM deals
     WHERE origin = 'embudo' AND created_at::date BETWEEN p_from AND p_to
  ),
  tas AS (
    SELECT count(*)::bigint AS n FROM deal_stage_history
     WHERE to_stage = 'appraisal_sent' AND changed_at::date BETWEEN p_from AND p_to
  ),
  cap AS (
    SELECT count(*)::bigint AS n FROM deal_stage_history
     WHERE to_stage = 'captured' AND changed_at::date BETWEEN p_from AND p_to
  )
  SELECT g.total,
         s.n, t.n, c.n,
         CASE WHEN s.n > 0 THEN round(g.total / s.n, 0) END,
         CASE WHEN t.n > 0 THEN round(g.total / t.n, 0) END,
         CASE WHEN c.n > 0 THEN round(g.total / c.n, 0) END,
         g.dias,
         (p_to - p_from + 1)::int
    FROM gasto g, sol s, tas t, cap c;
$$;

COMMENT ON FUNCTION get_funnel_costs(DATE, DATE) IS
  'Costo por solicitud/tasación/captación con la cobertura de datos de inversión.';

GRANT EXECUTE ON FUNCTION get_funnel_costs(DATE, DATE) TO authenticated;

-- Volumen por origen: permite comparar lo PAGO (embudo, clase_gratuita) contra
-- el REFERIDO, que no cuesta publicidad. Es la comparación que decide dónde
-- poner el esfuerzo, y por eso va junto a los costos.
DROP FUNCTION IF EXISTS get_funnel_volume_by_origin(DATE, DATE);

CREATE OR REPLACE FUNCTION get_funnel_volume_by_origin(p_from DATE, p_to DATE)
RETURNS TABLE (origen TEXT, solicitudes BIGINT, captaciones BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH sol AS (
    SELECT coalesce(origin, '(sin origen)') AS o, count(*)::bigint AS n
      FROM deals
     WHERE created_at::date BETWEEN p_from AND p_to
     GROUP BY 1
  ),
  cap AS (
    SELECT coalesce(d.origin, '(sin origen)') AS o, count(*)::bigint AS n
      FROM deal_stage_history h
      JOIN deals d ON d.id = h.deal_id
     WHERE h.to_stage = 'captured'
       AND h.changed_at::date BETWEEN p_from AND p_to
     GROUP BY 1
  )
  SELECT coalesce(sol.o, cap.o)  AS origen,
         coalesce(sol.n, 0)      AS solicitudes,
         coalesce(cap.n, 0)      AS captaciones
    FROM sol
    FULL OUTER JOIN cap ON cap.o = sol.o
   ORDER BY 2 DESC, 3 DESC;
$$;

COMMENT ON FUNCTION get_funnel_volume_by_origin(DATE, DATE) IS
  'Solicitudes y captaciones por origen, para comparar lo pago contra el referido.';

GRANT EXECUTE ON FUNCTION get_funnel_volume_by_origin(DATE, DATE) TO authenticated;

-- Cobertura de asignación de asesor, mes a mes.
-- Existe para MOSTRAR el problema, no para esconderlo: al 2026-08-06 solo 28
-- de 815 deals tienen assigned_to, así que cualquier métrica por persona sería
-- una mentira estadística. Esta pantalla es el argumento para arreglar el proceso.
DROP FUNCTION IF EXISTS get_advisor_coverage(DATE, DATE);

CREATE OR REPLACE FUNCTION get_advisor_coverage(p_from DATE, p_to DATE)
RETURNS TABLE (mes TEXT, total BIGINT, con_asesor BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(created_at, 'YYYY-MM') AS mes,
         count(*)::bigint                AS total,
         count(*) FILTER (WHERE assigned_to IS NOT NULL)::bigint AS con_asesor
    FROM deals
   WHERE created_at::date BETWEEN p_from AND p_to
   GROUP BY 1
   ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION get_advisor_coverage(DATE, DATE) TO authenticated;
