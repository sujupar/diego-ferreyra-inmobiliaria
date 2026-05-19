-- Fase 2 — Métricas del embudo
-- Stage transition timestamps for funnel metrics.
--
-- Hoy `deals` solo tiene `stage_changed_at` (singular, sobrescrito en cada
-- movimiento) + `visit_completed_at`. Esto impide responder "cuántas tasaciones
-- se entregaron entre el 1 y el 15 de mayo" sin esta data.
--
-- Agrego columnas dedicadas por transición. Backfill conservador: solo si el
-- stage CURRENT coincide con la transición (data anterior a esta migración
-- queda aproximada — los movimientos intermedios se perdieron porque
-- stage_changed_at era único).

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS scheduled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS captured_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at       TIMESTAMPTZ;

-- Backfill desde stage_changed_at / visit_completed_at.
-- Lógica: si el deal ya pasó (o está en) cierta etapa, asumimos que la fecha
-- de ese hito fue stage_changed_at (la última transición conocida).
UPDATE deals
  SET scheduled_at = stage_changed_at
  WHERE stage IN ('scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup', 'captured', 'lost')
    AND scheduled_at IS NULL;

UPDATE deals
  SET visited_at = COALESCE(visit_completed_at, stage_changed_at)
  WHERE stage IN ('visited', 'appraisal_sent', 'followup', 'captured')
    AND visited_at IS NULL;

UPDATE deals
  SET delivered_at = stage_changed_at
  WHERE stage IN ('appraisal_sent', 'followup', 'captured')
    AND delivered_at IS NULL;

UPDATE deals
  SET captured_at = stage_changed_at
  WHERE stage = 'captured'
    AND captured_at IS NULL;

UPDATE deals
  SET lost_at = stage_changed_at
  WHERE stage = 'lost'
    AND lost_at IS NULL;

-- Índices parciales: solo filas con timestamp poblado (sparse).
CREATE INDEX IF NOT EXISTS idx_deals_scheduled_at ON deals (scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_visited_at   ON deals (visited_at)   WHERE visited_at   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_delivered_at ON deals (delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_captured_at  ON deals (captured_at)  WHERE captured_at  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_lost_at      ON deals (lost_at)      WHERE lost_at      IS NOT NULL;

-- Índice compuesto para queries del tipo "deals por origen creados en rango".
CREATE INDEX IF NOT EXISTS idx_deals_origin_created ON deals (origin, created_at DESC);

COMMENT ON COLUMN deals.scheduled_at IS 'Timestamp persistente cuando el deal pasó a stage=scheduled (Fase 2)';
COMMENT ON COLUMN deals.visited_at   IS 'Timestamp de la visita realizada (stage visited o posterior)';
COMMENT ON COLUMN deals.delivered_at IS 'Timestamp de entrega de tasación (stage appraisal_sent o posterior)';
COMMENT ON COLUMN deals.captured_at  IS 'Timestamp de captación de propiedad (stage captured)';
COMMENT ON COLUMN deals.lost_at      IS 'Timestamp en que el deal se marcó perdido (stage lost)';
