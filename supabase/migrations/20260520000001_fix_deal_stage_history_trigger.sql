-- HOTFIX — Fase 2
-- El trigger original (20260518000002) intentaba INSERT en deal_stage_history
-- dentro de un BEFORE INSERT del propio deal. Eso causaba dos fallas:
--   1. Foreign key violation: deal_stage_history.deal_id REFERENCES deals(id),
--      pero el deal aún no estaba en la tabla → INSERT 500.
--   2. RLS bloqueaba el INSERT al historial porque no había política INSERT.
--
-- Solución: split en 2 triggers.
--   - BEFORE INSERT/UPDATE: solo modifica NEW para poblar columnas *_at.
--   - AFTER INSERT/UPDATE: hace INSERT a deal_stage_history cuando el deal
--     ya existe (FK satisfecho).
-- Funciones marcadas SECURITY DEFINER para que el INSERT al historial corra
-- con privilegios del owner y bypass RLS de deal_stage_history.

-- 1) BEFORE trigger: poblar columnas dedicadas. Sin tocar history.
CREATE OR REPLACE FUNCTION fn_deals_set_stage_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    IF NEW.stage = 'scheduled'      AND NEW.scheduled_at IS NULL THEN NEW.scheduled_at := NOW(); END IF;
    IF NEW.stage = 'visited'        AND NEW.visited_at   IS NULL THEN NEW.visited_at   := NOW(); END IF;
    IF NEW.stage = 'appraisal_sent' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := NOW(); END IF;
    IF NEW.stage = 'captured'       AND NEW.captured_at  IS NULL THEN NEW.captured_at  := NOW(); END IF;
    IF NEW.stage = 'lost'           AND NEW.lost_at      IS NULL THEN NEW.lost_at      := NOW(); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) AFTER trigger: insertar en historial cuando el deal ya está en la tabla.
CREATE OR REPLACE FUNCTION fn_deals_write_stage_history()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stage END,
      NEW.stage,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reemplazar el trigger único anterior por los dos nuevos.
DROP TRIGGER IF EXISTS trg_deals_stage_change ON deals;
DROP FUNCTION IF EXISTS fn_deals_track_stage_change();

DROP TRIGGER IF EXISTS trg_deals_set_stage_dates ON deals;
CREATE TRIGGER trg_deals_set_stage_dates
  BEFORE INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deals_set_stage_dates();

DROP TRIGGER IF EXISTS trg_deals_write_stage_history ON deals;
CREATE TRIGGER trg_deals_write_stage_history
  AFTER INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deals_write_stage_history();

-- Política INSERT explícita para authenticated, por si alguien quita el
-- SECURITY DEFINER en el futuro. El trigger viene del propio sistema, no
-- de input del usuario, así que WITH CHECK (true) es seguro.
DROP POLICY IF EXISTS "deal_stage_history_insert_system" ON deal_stage_history;
CREATE POLICY "deal_stage_history_insert_system" ON deal_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (true);

COMMENT ON FUNCTION fn_deals_set_stage_dates()      IS 'BEFORE trigger: pobla columnas *_at del deal según stage.';
COMMENT ON FUNCTION fn_deals_write_stage_history()  IS 'AFTER trigger: inserta fila en deal_stage_history. SECURITY DEFINER para bypass RLS.';
