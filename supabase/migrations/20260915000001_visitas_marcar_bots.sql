-- Marca las visitas de rastreadores para que no cuenten como visitantes.
--
-- POR QUÉ: el 2026-09-15, con el A/B de tasación recién encendido, 234 de 919
-- visitas (25%) resultaron ser rastreadores — casi todas `facebookexternalhit`,
-- el que previsualiza el enlace al crear o compartir un anuncio. 227 de esas 234
-- cayeron en la variante A. El panel mostraba A=790 / B=35 cuando lo real era
-- A=563 / B=34: le inflaba las visitas a una variante y le hundía la tasa de
-- conversión, sesgando el experimento a favor de la otra.
--
-- Se MARCAN, no se borran: un pico de `facebookexternalhit` avisa que alguien
-- tocó un anuncio, y borrarlo haría imposible auditar por qué cambió un número.

ALTER TABLE landing_page_visits
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN landing_page_visits.is_bot IS
  'true si el user-agent es de un rastreador y no de una persona. Lo decide lib/funnel/bots.ts al registrar la visita; el regex de abajo solo existió para marcar las filas anteriores a esta migración.';

-- Backfill de lo ya registrado. Este regex corre UNA SOLA VEZ: de acá en
-- adelante el criterio vive en `lib/funnel/bots.ts` y se guarda al insertar.
-- NO hay que mantener las dos listas en sincronía — si hiciera falta reclasificar
-- lo histórico, se corre un UPDATE puntual, no se copia la lista.
UPDATE landing_page_visits
   SET is_bot = true
 WHERE is_bot = false
   AND user_agent IS NOT NULL
   AND user_agent ~* '(facebookexternalhit|facebookcatalog|meta-externalagent|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|googlebot|bingbot|bingpreview|applebot|yandex(bot|images)|baiduspider|duckduckbot|petalbot|ahrefsbot|semrushbot|mj12bot|dotbot|bytespider|gptbot|claudebot|anthropic-ai|perplexitybot|ccbot|headlesschrome|phantomjs|puppeteer|playwright|python-requests|(^|[^a-z])(bot|crawler|spider|whatsapp|wget)([^a-z]|$)|curl/)';

-- El panel lee muchas visitas filtrando por embudo y fecha; con la marca nueva
-- conviene que el índice la contemple.
CREATE INDEX IF NOT EXISTS idx_landing_visits_panel
  ON landing_page_visits (funnel_type, visited_at)
  WHERE is_bot = false;

-- La RPC del A/B deja de contar rastreadores. Mismo RETURNS TABLE que antes, así
-- que el DROP es por prolijidad (ver CLAUDE.md: cambiar el tipo de retorno sin
-- DROP previo falla con 42P13).
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
       AND is_bot = false          -- <- lo único que cambia respecto de la versión anterior
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
  'Visitas (sin rastreadores), conversiones y tasa por variante de landing en un rango.';

GRANT EXECUTE ON FUNCTION get_landing_ab_results(TEXT, DATE, DATE) TO authenticated;
