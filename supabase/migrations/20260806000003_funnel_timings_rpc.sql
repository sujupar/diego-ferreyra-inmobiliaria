-- =============================================================================
-- Tiempos entre etapas del embudo
-- =============================================================================
-- MEDIANA, no promedio: con los volúmenes actuales (el paso más transitado
-- tiene 14 casos) un deal que tardó 90 días desplaza el promedio y esconde la
-- realidad. Se devuelve también `n` porque la app MUESTRA el tamaño de muestra
-- junto a cada número — ver el spec, §4.
--
-- `historico` se excluye por defecto: son 464 deals heredados del sistema
-- anterior, sin historial real de etapas.
-- =============================================================================

DROP FUNCTION IF EXISTS get_funnel_stage_timings(DATE, DATE, TEXT[]);

CREATE OR REPLACE FUNCTION get_funnel_stage_timings(
  p_from    DATE,
  p_to      DATE,
  p_origins TEXT[] DEFAULT ARRAY['embudo','clase_gratuita','referido']
)
RETURNS TABLE (
  desde        TEXT,
  hasta        TEXT,
  n            BIGINT,
  mediana_dias NUMERIC,
  p75_dias     NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT h.deal_id,
           h.to_stage,
           h.changed_at,
           LAG(h.to_stage)   OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) AS etapa_previa,
           LAG(h.changed_at) OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) AS entro_at
      FROM deal_stage_history h
      JOIN deals d ON d.id = h.deal_id
     WHERE d.origin = ANY(p_origins)
  )
  SELECT etapa_previa AS desde,
         to_stage     AS hasta,
         count(*)     AS n,
         round(percentile_cont(0.5)  WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (changed_at - entro_at)) / 86400.0)::numeric, 1) AS mediana_dias,
         round(percentile_cont(0.75) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (changed_at - entro_at)) / 86400.0)::numeric, 1) AS p75_dias
    FROM ev
   WHERE entro_at IS NOT NULL
     -- El período filtra por CUÁNDO OCURRIÓ la transición, no por cuándo se
     -- creó el deal: si no, un deal viejo que avanzó ayer quedaría afuera.
     AND changed_at::date BETWEEN p_from AND p_to
   GROUP BY 1, 2
   ORDER BY n DESC;
$$;

COMMENT ON FUNCTION get_funnel_stage_timings(DATE, DATE, TEXT[]) IS
  'Tiempo entre etapas del embudo: mediana y p75 en días, con el tamaño de muestra.';

GRANT EXECUTE ON FUNCTION get_funnel_stage_timings(DATE, DATE, TEXT[]) TO authenticated;
