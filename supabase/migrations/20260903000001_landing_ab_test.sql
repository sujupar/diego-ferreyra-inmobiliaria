-- =============================================================================
-- A/B testing de landings del embudo
-- =============================================================================
-- Un experimento por embudo (hoy solo 'tasacion'). El reparto se guarda como el
-- PORCENTAJE que va a la variante B; A se lleva el resto. Es una sola fila por
-- embudo y se edita desde /embudos.
--
-- POR QUÉ UNA TABLA Y NO UNA ENV VAR: el dueño tiene que poder mover la barra y
-- apagar el test sin un deploy. Una env var obliga a redeployar y a esperar 3
-- minutos con tráfico pago corriendo.
--
-- Los tres estados del experimento son distintos a propósito:
--   'off'     — el test nunca se encendió o se apagó eligiendo ganador.
--               Se sirve `winner` (o 'A' si no hay).
--   'running' — se reparte según `split_b`.
--   'paused'  — se pausó SIN elegir ganador: vuelve todo a 'A', pero el
--               experimento conserva `split_b` para poder retomarlo igual.
-- Sin el estado 'paused' hay que decidir un ganador para poder frenar, que es
-- justo lo que no se quiere cuando el test todavía no concluyó.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.landing_experiments (
  funnel        TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'off',
  split_b       SMALLINT NOT NULL DEFAULT 50,
  winner        TEXT,
  variant_a_label TEXT NOT NULL DEFAULT 'Actual',
  variant_b_label TEXT NOT NULL DEFAULT 'Tasación Neta',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT landing_experiments_status_chk CHECK (status IN ('off', 'running', 'paused')),
  CONSTRAINT landing_experiments_split_chk  CHECK (split_b BETWEEN 0 AND 100),
  CONSTRAINT landing_experiments_winner_chk CHECK (winner IS NULL OR winner IN ('A', 'B'))
);

COMMENT ON TABLE public.landing_experiments IS
  'Configuración del A/B de landings por embudo. split_b = % que ve la variante B.';
COMMENT ON COLUMN public.landing_experiments.status IS
  'off = se sirve winner (o A) | running = reparte por split_b | paused = todos a A, conserva split_b';

-- Fila del embudo de tasación. Arranca APAGADO a propósito: encenderlo es una
-- decisión que se toma desde la pantalla, no un efecto de correr la migración.
INSERT INTO public.landing_experiments (funnel, status, split_b, variant_a_label, variant_b_label)
VALUES ('tasacion', 'off', 50, 'Actual', 'Tasación Neta')
ON CONFLICT (funnel) DO NOTHING;

ALTER TABLE public.landing_experiments ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquiera autenticado (la pantalla de embudos ya está gateada por rol).
DROP POLICY IF EXISTS landing_experiments_select ON public.landing_experiments;
CREATE POLICY landing_experiments_select ON public.landing_experiments
  FOR SELECT TO authenticated USING (true);

-- Escritura: solo operaciones. La ruta de la app usa service_role igual, esto es
-- defensa en profundidad por si alguna vez se escribe desde el cliente.
DROP POLICY IF EXISTS landing_experiments_update ON public.landing_experiments;
CREATE POLICY landing_experiments_update ON public.landing_experiments
  FOR UPDATE TO authenticated USING (is_operations_user()) WITH CHECK (is_operations_user());

-- =============================================================================
-- La variante viaja hasta el deal y hasta la visita.
-- =============================================================================
-- ADITIVO y nullable: todo lo anterior al experimento queda en NULL, que es la
-- verdad (no había variante). No se pone default 'A' porque eso mentiría sobre
-- los 260 deals históricos.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS landing_variant TEXT;

ALTER TABLE public.landing_page_visits
  ADD COLUMN IF NOT EXISTS landing_variant TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_landing_variant_chk'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_landing_variant_chk
      CHECK (landing_variant IS NULL OR landing_variant IN ('A', 'B'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'landing_page_visits_landing_variant_chk'
  ) THEN
    ALTER TABLE public.landing_page_visits
      ADD CONSTRAINT landing_page_visits_landing_variant_chk
      CHECK (landing_variant IS NULL OR landing_variant IN ('A', 'B'));
  END IF;
END $$;

COMMENT ON COLUMN public.deals.landing_variant IS
  'Variante de landing que vio quien se registró. NULL = anterior al experimento.';

-- Índices parciales: las consultas del panel SIEMPRE filtran por variante no
-- nula, así que el índice solo necesita las filas del experimento.
CREATE INDEX IF NOT EXISTS deals_landing_variant_idx
  ON public.deals (landing_variant, created_at)
  WHERE landing_variant IS NOT NULL;

-- OJO: esta tabla marca el tiempo con `visited_at`, no con `created_at`.
CREATE INDEX IF NOT EXISTS landing_page_visits_variant_idx
  ON public.landing_page_visits (landing_variant, visited_at)
  WHERE landing_variant IS NOT NULL;

-- =============================================================================
-- Resultados del experimento: visitas y conversiones por variante.
-- =============================================================================
-- Se cuenta por VISITA y por DEAL, no por sesión de video: la pregunta que
-- responde el panel es "cuál convierte más", y la conversión es el deal.
DROP FUNCTION IF EXISTS get_landing_ab_results(TEXT, DATE, DATE);

CREATE OR REPLACE FUNCTION get_landing_ab_results(
  p_funnel TEXT,
  p_from   DATE,
  p_to     DATE
)
RETURNS TABLE (
  variante     TEXT,
  visitas      BIGINT,
  conversiones BIGINT,
  tasa         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vs AS (
    SELECT landing_variant AS v, count(*)::bigint AS n
      FROM landing_page_visits
     WHERE landing_variant IS NOT NULL
       AND funnel_type = p_funnel
       AND visited_at::date BETWEEN p_from AND p_to
     GROUP BY 1
  ),
  cv AS (
    SELECT landing_variant AS v, count(*)::bigint AS n
      FROM deals
     WHERE landing_variant IS NOT NULL
       AND origin = CASE WHEN p_funnel = 'tasacion' THEN 'embudo' ELSE 'clase_gratuita' END
       AND created_at::date BETWEEN p_from AND p_to
     GROUP BY 1
  )
  SELECT x.v,
         coalesce(vs.n, 0),
         coalesce(cv.n, 0),
         CASE WHEN coalesce(vs.n, 0) = 0 THEN 0
              ELSE round(coalesce(cv.n, 0)::numeric * 100 / vs.n, 2) END
    FROM (VALUES ('A'), ('B')) AS x(v)
    LEFT JOIN vs ON vs.v = x.v
    LEFT JOIN cv ON cv.v = x.v
   ORDER BY x.v;
$$;

COMMENT ON FUNCTION get_landing_ab_results(TEXT, DATE, DATE) IS
  'Visitas, conversiones y tasa por variante de landing en un rango.';

GRANT EXECUTE ON FUNCTION get_landing_ab_results(TEXT, DATE, DATE) TO authenticated;
