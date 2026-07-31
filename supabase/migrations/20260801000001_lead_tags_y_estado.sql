-- Etiquetas del embudo + estado del comprador. 100% ADITIVA.
--
-- Dos conceptos DISTINTOS a propósito:
--   ESTADO    → uno solo por persona, avanza con los HECHOS, nunca a mano.
--   ETIQUETAS → varias por persona, las pone el equipo, son de colores.
-- Mezclarlos es lo que hace que un CRM termine con 40 "estados" que nadie usa.

-- 1. Estado en el embudo.
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS pipeline_state TEXT NOT NULL DEFAULT 'nuevo';
ALTER TABLE property_leads DROP CONSTRAINT IF EXISTS property_leads_pipeline_state_check;
ALTER TABLE property_leads ADD CONSTRAINT property_leads_pipeline_state_check
  CHECK (pipeline_state IN ('nuevo','contactado','visita_agendada','visito','negociando','cerrado','perdido'));
COMMENT ON COLUMN property_leads.pipeline_state IS 'Estado en el embudo. Lo mueven los HECHOS (primer mensaje del equipo, visita agendada, visita realizada). Nunca retrocede solo: solo una persona puede bajarlo.';

CREATE INDEX IF NOT EXISTS property_leads_pipeline_state_idx
  ON property_leads (pipeline_state) WHERE deleted_at IS NULL;

-- 2. Catálogo de etiquetas.
CREATE TABLE IF NOT EXISTS lead_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE lead_tags IS 'Catálogo de etiquetas que el equipo le pone a un comprador. Editable: agregar una fila alcanza para que aparezca en la UI.';

-- 3. Qué etiqueta tiene quién. Quitar una etiqueta BORRA la fila (es una
--    relación, no un dato del negocio); el historial del lead no se toca.
CREATE TABLE IF NOT EXISTS lead_tag_assignments (
  lead_id     UUID NOT NULL REFERENCES property_leads(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);
CREATE INDEX IF NOT EXISTS lead_tag_assignments_tag_idx ON lead_tag_assignments (tag_id);

-- 4. Historial de cambios de estado: quién, cuándo y por qué. Mismo criterio que
--    `deal_stage_history` — sin esto, "¿por qué este lead figura como visitado?"
--    no tiene respuesta.
CREATE TABLE IF NOT EXISTS lead_state_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES property_leads(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state   TEXT NOT NULL,
  reason     TEXT,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_state_history_lead_idx ON lead_state_history (lead_id, changed_at DESC);

-- 5. RLS: mismo criterio que el resto de leads — todos MENOS el abogado.
--    Se expresa como `NOT is_lawyer()` porque no existe una función que devuelva
--    el rol; `is_operations_user()` sola dejaría afuera al asesor, que es
--    justamente quien más va a etiquetar.
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_state_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_tags_read ON lead_tags;
CREATE POLICY lead_tags_read ON lead_tags FOR SELECT TO authenticated
  USING (NOT public.is_lawyer());

DROP POLICY IF EXISTS lead_tag_assignments_read ON lead_tag_assignments;
CREATE POLICY lead_tag_assignments_read ON lead_tag_assignments FOR SELECT TO authenticated
  USING (NOT public.is_lawyer());

DROP POLICY IF EXISTS lead_state_history_read ON lead_state_history;
CREATE POLICY lead_state_history_read ON lead_state_history FOR SELECT TO authenticated
  USING (NOT public.is_lawyer());

-- 6. Semilla del catálogo. Idempotente.
INSERT INTO lead_tags (slug, label, color, sort_order) VALUES
  ('caliente',            'Caliente',              'red',    10),
  ('tibio',               'Tibio',                 'amber',  20),
  ('frio',                'Frío',                  'slate',  30),
  ('apurado',             'Apurado',               'orange', 40),
  ('necesita_credito',    'Necesita crédito',      'violet', 50),
  ('comprador_exterior',  'Comprador del exterior','emerald',60),
  ('inversor',            'Inversor',              'blue',   70),
  ('primera_vivienda',    'Primera vivienda',      'cyan',   80),
  ('negocia_precio',      'Negocia precio',        'yellow', 90),
  ('permuta',             'Permuta',               'teal',  100),
  ('solo_mira',           'Solo mira',             'zinc',  110),
  ('ya_visito_otras',     'Ya visitó otras',       'indigo',120)
ON CONFLICT (slug) DO NOTHING;
