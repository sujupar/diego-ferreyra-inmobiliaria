CREATE TABLE IF NOT EXISTS visit_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
  response_source TEXT NOT NULL CHECK (response_source IN ('advisor', 'client')),
  liked BOOLEAN,
  most_liked TEXT,
  least_liked TEXT,
  in_price BOOLEAN,
  hypothetical_offer NUMERIC,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_questionnaires_visit ON visit_questionnaires(visit_id);

CREATE TABLE IF NOT EXISTS visit_questionnaire_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  sent_to TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_questionnaire_tokens_token ON visit_questionnaire_tokens(token);

ALTER TABLE visit_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_questionnaire_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY vq_select_all ON visit_questionnaires FOR SELECT TO authenticated USING (true);
CREATE POLICY vq_insert_authenticated ON visit_questionnaires FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY vqt_admin_read ON visit_questionnaire_tokens FOR SELECT TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','dueno','coordinador')
);
