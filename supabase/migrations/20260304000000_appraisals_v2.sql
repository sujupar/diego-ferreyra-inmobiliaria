-- Migration: Redesign appraisals schema to store complete valuation data
-- Drops old sparse tables, creates new comprehensive schema

-- Drop old tables (no production data)
DROP TABLE IF EXISTS property_images CASCADE;
DROP TABLE IF EXISTS comparables CASCADE;
DROP TABLE IF EXISTS appraisals CASCADE;

-- Main appraisals table: subject property + complete valuation result
CREATE TABLE appraisals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Subject property data (from ScrapedProperty)
  property_title TEXT,
  property_location TEXT NOT NULL,
  property_description TEXT,
  property_url TEXT,
  property_price NUMERIC,
  property_currency TEXT DEFAULT 'USD',
  property_images TEXT[],
  property_features JSONB NOT NULL,     -- Full PropertyFeatures object

  -- Complete ValuationResult snapshot (21+ fields stored as JSONB)
  valuation_result JSONB NOT NULL,

  -- Denormalized summary fields for list views (avoids JSONB parsing)
  publication_price NUMERIC NOT NULL,
  sale_value NUMERIC,
  money_in_hand NUMERIC,
  currency TEXT DEFAULT 'USD',
  comparable_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Comparables with full data
CREATE TABLE appraisal_comparables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appraisal_id UUID NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,

  title TEXT,
  location TEXT,
  url TEXT,
  price NUMERIC,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  images TEXT[],
  features JSONB NOT NULL,
  analysis JSONB,                       -- ComparableAnalysis without nested property field

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_appraisals_created ON appraisals(created_at DESC);
CREATE INDEX idx_comp_appraisal ON appraisal_comparables(appraisal_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appraisals_updated_at
  BEFORE UPDATE ON appraisals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: Open policies for internal tool (no auth for MVP)
ALTER TABLE appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_comparables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON appraisals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON appraisal_comparables FOR ALL USING (true) WITH CHECK (true);
