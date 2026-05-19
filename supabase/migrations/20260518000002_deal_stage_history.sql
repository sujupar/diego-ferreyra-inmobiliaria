-- Fase 2 — Métricas del embudo
-- Auditoría de transiciones de stage por deal + trigger que mantiene las
-- columnas dedicadas (scheduled_at/visited_at/delivered_at/captured_at/lost_at)
-- alineadas automáticamente con cada cambio de stage.

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id          BIGSERIAL PRIMARY KEY,
  deal_id     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal             ON deal_stage_history (deal_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_to_stage_changed ON deal_stage_history (to_stage, changed_at DESC);

-- Trigger: cada cambio de stage inserta una fila + pobla las columnas dedicadas
-- del deal. BEFORE para que pueda modificar NEW antes de persistir.
CREATE OR REPLACE FUNCTION fn_deals_track_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    -- Auditoría granular
    INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at)
    VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stage END, NEW.stage, NOW());

    -- Mantener columnas *_at alineadas. Solo set en primera transición real
    -- (idempotente: re-llegar al mismo stage no sobrescribe el timestamp original).
    IF NEW.stage = 'scheduled'      AND NEW.scheduled_at IS NULL THEN NEW.scheduled_at := NOW(); END IF;
    IF NEW.stage = 'visited'        AND NEW.visited_at   IS NULL THEN NEW.visited_at   := NOW(); END IF;
    IF NEW.stage = 'appraisal_sent' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := NOW(); END IF;
    IF NEW.stage = 'captured'       AND NEW.captured_at  IS NULL THEN NEW.captured_at  := NOW(); END IF;
    IF NEW.stage = 'lost'           AND NEW.lost_at      IS NULL THEN NEW.lost_at      := NOW(); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deals_stage_change ON deals;
CREATE TRIGGER trg_deals_stage_change
  BEFORE INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deals_track_stage_change();

-- Backfill inicial: una fila por deal existente con el stage actual.
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at)
SELECT id, NULL, stage, COALESCE(stage_changed_at, created_at)
FROM deals
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_history h WHERE h.deal_id = deals.id);

-- RLS: lectura para roles que ven el pipeline. INSERT solo por sistema (trigger).
ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_stage_history_read" ON deal_stage_history;
CREATE POLICY "deal_stage_history_read" ON deal_stage_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','dueno','coordinador')
    )
  );

COMMENT ON TABLE deal_stage_history IS 'Auditoría de transiciones de stage. Una fila por movimiento. Mantenida por trigger fn_deals_track_stage_change.';
