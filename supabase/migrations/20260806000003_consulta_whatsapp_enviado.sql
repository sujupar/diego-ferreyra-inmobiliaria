-- Marca de "a esta consulta ya se le contestó por WhatsApp". ADITIVA.
--
-- POR QUÉ EXISTE: la ingesta relee la casilla y puede reprocesar el mismo mail.
-- Sin esta marca, una persona recibiría el mismo WhatsApp dos o tres veces —
-- que además de molesto es la clase de cosa por la que Meta penaliza un número.
ALTER TABLE portal_inquiries
  ADD COLUMN IF NOT EXISTS whatsapp_enviado_at TIMESTAMPTZ;

COMMENT ON COLUMN portal_inquiries.whatsapp_enviado_at IS
  'Cuándo se le mandó el WhatsApp automático de respuesta. NULL = todavía no (o no correspondía). Es el freno de idempotencia de responderConsulta.';

CREATE INDEX IF NOT EXISTS portal_inquiries_sin_responder_idx
  ON portal_inquiries (received_at DESC) WHERE whatsapp_enviado_at IS NULL;
