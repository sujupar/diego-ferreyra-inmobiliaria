-- Tasador IA: segunda valuación (misma forma que valuation_result) + cuál está en uso.
-- Aditiva: nada existente cambia; las tasaciones viejas quedan en 'calculator'.
ALTER TABLE appraisals
  ADD COLUMN IF NOT EXISTS ai_valuation_result JSONB,
  ADD COLUMN IF NOT EXISTS ai_valuation_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_valuation_error TEXT,
  ADD COLUMN IF NOT EXISTS valuation_source TEXT NOT NULL DEFAULT 'calculator';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisals_ai_valuation_status_check') THEN
    ALTER TABLE appraisals ADD CONSTRAINT appraisals_ai_valuation_status_check
      CHECK (ai_valuation_status IS NULL OR ai_valuation_status IN ('pending','ready','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisals_valuation_source_check') THEN
    ALTER TABLE appraisals ADD CONSTRAINT appraisals_valuation_source_check
      CHECK (valuation_source IN ('calculator','ai'));
  END IF;
END $$;

COMMENT ON COLUMN appraisals.ai_valuation_result IS 'Snapshot del Tasador IA (ValuationResult + meta.ai). Independiente de valuation_result.';
COMMENT ON COLUMN appraisals.valuation_source IS 'Tasador en uso: calculator | ai. Los precios desnormalizados siguen a este.';
