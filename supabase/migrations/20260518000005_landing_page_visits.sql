-- Fase 7 — Tracking de visitas a landings
-- Tabla genérica para registrar visitas a cualquier landing pública. Incluye
-- funnel_type para diferenciar landings de campañas (clase_gratuita | tasacion)
-- de landings de propiedades (otro).
--
-- Para landings hosteadas en GHL Funnels (clase gratuita / solicitud de
-- tasación), el tracking se hace cuando esas landings hagan POST a
-- /api/landing/track-visit (próxima iteración).

CREATE TABLE IF NOT EXISTS landing_page_visits (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT NOT NULL,
  funnel_type   TEXT NOT NULL DEFAULT 'otro' CHECK (funnel_type IN ('clase_gratuita', 'tasacion', 'otro')),
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,
  utm_term      TEXT,
  fbclid        TEXT,
  gclid         TEXT,
  referrer      TEXT,
  user_agent    TEXT,
  ip_hash       TEXT,
  visited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lpv_visited_at         ON landing_page_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lpv_funnel_visited     ON landing_page_visits (funnel_type, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lpv_slug_visited       ON landing_page_visits (slug, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lpv_utm_campaign       ON landing_page_visits (utm_campaign, visited_at DESC) WHERE utm_campaign IS NOT NULL;

ALTER TABLE landing_page_visits ENABLE ROW LEVEL SECURITY;

-- INSERT desde el endpoint público (anon) para tracking server-side.
DROP POLICY IF EXISTS "lpv_insert_anon" ON landing_page_visits;
CREATE POLICY "lpv_insert_anon" ON landing_page_visits FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "lpv_insert_authenticated" ON landing_page_visits;
CREATE POLICY "lpv_insert_authenticated" ON landing_page_visits FOR INSERT TO authenticated WITH CHECK (true);

-- SELECT solo a roles operacionales.
DROP POLICY IF EXISTS "lpv_read_admin" ON landing_page_visits;
CREATE POLICY "lpv_read_admin" ON landing_page_visits FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dueno','coordinador'))
  );

COMMENT ON TABLE landing_page_visits IS 'Fase 7 — Tracking de visitas a landings (propiedades + landings de campañas cuando se conecten).';

-- ============================================================================
-- vw_landing_conversion_daily — Visitas vs registros, por día y funnel_type.
-- ============================================================================
-- Calcula visitas → registros (deals creados con mismo funnel_type) para medir
-- la conversión de landing en el embudo. Solo informativo si las landings de
-- campañas todavía no postean a /api/landing/track-visit.
CREATE OR REPLACE VIEW vw_landing_conversion_daily AS
WITH visits AS (
  SELECT
    visited_at::date AS day,
    funnel_type,
    COUNT(*)::BIGINT AS visits
  FROM landing_page_visits
  GROUP BY 1, 2
),
regs AS (
  SELECT
    created_at::date AS day,
    CASE
      WHEN origin = 'clase_gratuita' THEN 'clase_gratuita'
      WHEN origin IS NULL OR origin <> 'clase_gratuita' THEN 'tasacion'
    END AS funnel_type,
    COUNT(*)::BIGINT AS registrations
  FROM deals
  GROUP BY 1, 2
)
SELECT
  COALESCE(v.day, r.day)                        AS day,
  COALESCE(v.funnel_type, r.funnel_type)        AS funnel_type,
  COALESCE(v.visits, 0)                         AS visits,
  COALESCE(r.registrations, 0)                  AS registrations,
  CASE
    WHEN COALESCE(v.visits, 0) > 0
    THEN ROUND(COALESCE(r.registrations, 0)::NUMERIC / v.visits * 100, 2)
    ELSE NULL
  END AS conversion_pct
FROM visits v
FULL OUTER JOIN regs r ON v.day = r.day AND v.funnel_type = r.funnel_type;

COMMENT ON VIEW vw_landing_conversion_daily IS 'Fase 7 — Visitas a landing vs registros del mismo funnel_type, por día.';
