-- Visibilidad de WhatsApp + papelera de leads (2026-07-30).
-- 100% ADITIVA: no borra ni modifica ningún dato existente.

-- 1. Mensajes de WhatsApp: fuente de verdad de TODO lo que entra y sale.
--    Hasta hoy no existía NINGÚN registro: el cliente de envío descartaba la
--    respuesta de Meta entera, así que nadie podía saber si un mensaje salió, a
--    qué número, ni por qué falló. Y una respuesta de un cliente se perdía.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction      TEXT NOT NULL CHECK (direction IN ('out','in')),
  -- Teléfono en E.164 SIN '+' (formato de la Cloud API). Clave de la conversación.
  phone_e164     TEXT NOT NULL,
  -- El número canónico que devuelve Meta en contacts[].wa_id. Puede diferir del
  -- que mandamos: a los móviles argentinos Meta les agrega el 9.
  wa_id          TEXT,
  wa_message_id  TEXT UNIQUE,
  contact_name   TEXT,
  lead_id        UUID REFERENCES property_leads(id) ON DELETE SET NULL,
  property_id    UUID REFERENCES properties(id) ON DELETE SET NULL,
  template_name  TEXT,
  body_preview   TEXT,
  payload        JSONB,
  status         TEXT NOT NULL DEFAULT 'accepted',
  error_code     TEXT,
  error_message  TEXT,
  sent_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE whatsapp_messages IS 'Todos los mensajes de WhatsApp, salientes y entrantes, con su estado de entrega. Alimenta el chat del Inbox.';
COMMENT ON COLUMN whatsapp_messages.status IS 'skipped|accepted|sent|delivered|read|failed. Texto libre A PROPÓSITO: Meta agrega estados nuevos sin avisar y un CHECK haría fallar el webhook.';
COMMENT ON COLUMN whatsapp_messages.wa_id IS 'Número canónico segun Meta (contacts[].wa_id). Si difiere de phone_e164, Meta lo corrigió.';

CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx   ON whatsapp_messages (phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_lead_idx    ON whatsapp_messages (lead_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_created_idx ON whatsapp_messages (created_at DESC);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
-- Solo operaciones (admin/dueño/coordinador): las filas tienen teléfono y texto de
-- clientes. Mismo criterio que property_leads; el abogado queda afuera.
DROP POLICY IF EXISTS whatsapp_messages_ops_read ON whatsapp_messages;
CREATE POLICY whatsapp_messages_ops_read ON whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- 2. Papelera de leads: borrado LÓGICO. Nada se pierde nunca; restaurar =
--    volver a poner deleted_at en NULL.
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS property_leads_not_deleted_idx
  ON property_leads (created_at DESC) WHERE deleted_at IS NULL;
COMMENT ON COLUMN property_leads.deleted_at IS 'Borrado lógico desde el Inbox. NULL = visible. Se restaura poniéndolo en NULL.';
