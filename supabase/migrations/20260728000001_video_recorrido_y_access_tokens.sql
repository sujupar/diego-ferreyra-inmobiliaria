-- 1. Media nueva: el VIDEO RECORRIDO (distinto de video_url/video_file_url/tour_3d_url)
--    y qué se le entrega al cliente registrado.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS video_recorrido_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deliver_media TEXT;

COMMENT ON COLUMN properties.video_recorrido_url IS 'Video que recorre la propiedad por dentro. Se le ENTREGA al cliente que se registra (no va en la landing pública). Enlace externo o URL de Storage.';
COMMENT ON COLUMN properties.deliver_media IS 'Qué se entrega al cliente registrado: video_recorrido | tour_3d. Lo elige el asesor al crear la landing.';

-- 2. Token de acceso por persona ("el hash"): abre el recorrido y prellena la agenda.
CREATE TABLE IF NOT EXISTS lead_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT NOT NULL UNIQUE,
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES property_leads(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at    TIMESTAMPTZ,
  open_count   INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  -- Visita propuesta desde ESTE token. "La última propuesta gana": si la persona
  -- vuelve y elige otro día, se ACTUALIZA esta visita en vez de crear otra.
  visit_id     UUID REFERENCES property_visits(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS lead_access_tokens_property_idx ON lead_access_tokens (property_id);

-- Idempotente para bases donde la tabla ya exista sin la columna.
ALTER TABLE lead_access_tokens
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES property_visits(id) ON DELETE SET NULL;

-- RLS: la tabla se lee/escribe SOLO con service-role desde rutas públicas.
-- La lectura de staff se restringe a operaciones (admin/dueno/coordinador): la
-- fila tiene nombre, email y teléfono de un lead, y el abogado está gateado de
-- leads en toda la app (mismo criterio que la policy `leads_select` de
-- `property_leads`).
ALTER TABLE lead_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_access_tokens_staff_read ON lead_access_tokens;
CREATE POLICY lead_access_tokens_staff_read ON lead_access_tokens
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- 3. Estado nuevo de visita: propuesta por el cliente, a confirmar por el equipo.
--    OJO: hay que RECREAR el CHECK — agregar un valor sin esto rompe con 23514.
ALTER TABLE property_visits DROP CONSTRAINT IF EXISTS property_visits_status_check;
ALTER TABLE property_visits ADD CONSTRAINT property_visits_status_check
  CHECK (status IN ('pending_confirmation','scheduled','completed','no_show','cancelled'));
