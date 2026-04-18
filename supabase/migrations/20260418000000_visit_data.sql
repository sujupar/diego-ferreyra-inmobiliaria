-- supabase/migrations/20260418000000_visit_data.sql
-- Añade snapshot de datos recogidos en la visita al inmueble, serializado en JSONB.
-- Se usa para prellenar la tasación posterior.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS property_type TEXT,
  ADD COLUMN IF NOT EXISTS property_type_other TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS rooms INTEGER,
  ADD COLUMN IF NOT EXISTS covered_area NUMERIC,
  ADD COLUMN IF NOT EXISTS visit_data JSONB,
  ADD COLUMN IF NOT EXISTS visit_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deals_property_type ON deals(property_type);
CREATE INDEX IF NOT EXISTS idx_deals_neighborhood ON deals(neighborhood);

COMMENT ON COLUMN deals.visit_data IS 'JSONB snapshot con {sale: SalePropertyData, purchase: PurchasePropertyData | null}';
COMMENT ON COLUMN deals.visit_completed_at IS 'Timestamp cuando el asesor marcó visita realizada por primera vez';

-- Función RPC para merge atómico de visit_data (evita race condition read-modify-write)
CREATE OR REPLACE FUNCTION merge_deal_visit_data(p_deal_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merged JSONB;
BEGIN
  UPDATE deals
  SET visit_data = COALESCE(visit_data, '{}'::jsonb) || p_patch,
      updated_at = now()
  WHERE id = p_deal_id
  RETURNING visit_data INTO v_merged;
  RETURN v_merged;
END;
$$;
