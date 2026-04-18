-- Contactos
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  origin TEXT CHECK (origin IN ('embudo', 'referido', 'historico')),
  assigned_to UUID REFERENCES profiles(id),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_all" ON contacts FOR ALL USING (auth.uid() IS NOT NULL);

-- Tasaciones agendadas
CREATE TABLE scheduled_appraisals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  contact_id UUID REFERENCES contacts(id),
  property_address TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  origin TEXT CHECK (origin IN ('embudo', 'referido', 'historico')),
  assigned_to UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  appraisal_id UUID REFERENCES appraisals(id),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE scheduled_appraisals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sched_all" ON scheduled_appraisals FOR ALL USING (auth.uid() IS NOT NULL);

-- Asociar contactos a tasaciones y propiedades
ALTER TABLE appraisals ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
