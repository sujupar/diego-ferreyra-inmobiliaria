-- Sumar campos de notas al agendar y datos pre-visita del cliente comprador.
ALTER TABLE scheduled_appraisals
  ADD COLUMN IF NOT EXISTS scheduling_notes TEXT,
  ADD COLUMN IF NOT EXISTS buyer_interest JSONB;

COMMENT ON COLUMN scheduled_appraisals.scheduling_notes IS
  'Notas libres al agendar la tasación (motivo de venta, urgencia, horarios preferidos, etc.)';
COMMENT ON COLUMN scheduled_appraisals.buyer_interest IS
  'Si el cliente además quiere comprar: {zona, presupuesto_min, presupuesto_max, ambientes_min, notas}';

-- FK explícita deals → scheduled_appraisals para joins limpios (no existía).
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS scheduled_appraisal_id UUID
    REFERENCES scheduled_appraisals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_scheduled_appraisal_id
  ON deals(scheduled_appraisal_id);

COMMENT ON COLUMN deals.scheduled_appraisal_id IS
  'FK al agendamiento original cuando el deal nace de una tasación agendada';
