-- property_visits: agendamiento de visitas de clientes a propiedades publicadas.
-- Cualquier asesor puede agendar visitas a cualquier propiedad.

-- Función set_updated_at() — no existe en migraciones previas, la creamos idempotentemente.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS property_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  advisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled')),
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_property_visits_property ON property_visits(property_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_advisor ON property_visits(advisor_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_status ON property_visits(status);
CREATE INDEX IF NOT EXISTS idx_property_visits_scheduled_at ON property_visits(scheduled_at);

CREATE TRIGGER trg_property_visits_updated_at
  BEFORE UPDATE ON property_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: alineado con la política general de marketplace (todos los asesores ven todas)
ALTER TABLE property_visits ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado
CREATE POLICY property_visits_select_all ON property_visits
  FOR SELECT TO authenticated USING (true);

-- INSERT: cualquier asesor autenticado puede crear
CREATE POLICY property_visits_insert_self ON property_visits
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid() OR advisor_id = auth.uid()
  );

-- UPDATE: el asesor de la visita, el creador, o roles admin/dueno/coordinador
CREATE POLICY property_visits_update ON property_visits
  FOR UPDATE TO authenticated USING (
    advisor_id = auth.uid()
    OR created_by = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','dueno','coordinador')
  );

-- DELETE: solo admin/dueno
CREATE POLICY property_visits_delete ON property_visits
  FOR DELETE TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','dueno')
  );
