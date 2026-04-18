-- supabase/migrations/20260418000002_legal_review_events.sql
-- Audit log para todas las acciones de revisión legal (asesor envía, abogado aprueba/rechaza, comentarios).

CREATE TABLE IF NOT EXISTS legal_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  item_key TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_legal_review_events_property ON legal_review_events(property_id, created_at DESC);
CREATE INDEX idx_legal_review_events_actor ON legal_review_events(actor_id, created_at DESC);

ALTER TABLE legal_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read all legal events for authenticated"
  ON legal_review_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insert legal events for authenticated"
  ON legal_review_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE legal_review_events IS 'Track record histórico de revisión legal: quién hizo qué, cuándo, con qué notas';
