-- De dónde viene cada conversación de WhatsApp. 100% ADITIVA.
--
-- POR QUÉ EXISTE: son DOS embudos distintos y hasta ahora se veían iguales en
-- el Inbox. Una persona que se registró en una landing pidió un recorrido y
-- sabe quiénes somos; una que dejó una consulta en ZonaProp preguntó por un
-- aviso y capaz ni recuerda haberlo hecho. Se les habla distinto, se los mide
-- distinto y el equipo necesita filtrarlos.
--
-- EXPLÍCITO, NO DEDUCIDO. Se podría inferir después (por la plantilla usada,
-- por si hay lead, por el origen del lead) y esa es exactamente la clase de
-- inferencia que ya nos falló dos veces en este proyecto: las visitas de la IA
-- se contaban cruzando teléfonos, y el resultado era un número aproximado
-- presentado como exacto. Un dato que se sabe en el momento de escribir la fila
-- se guarda en el momento de escribir la fila.
--
-- NULL es un valor legítimo: las conversaciones anteriores a esta migración no
-- se inventan. El Inbox las muestra sin origen, no las esconde.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS origen TEXT
  CHECK (origen IS NULL OR origen IN ('consulta_portal', 'landing', 'manual'));

COMMENT ON COLUMN whatsapp_messages.origen IS
  'De dónde nació la conversación: consulta_portal (ZonaProp/Argenprop) · landing (se registró en una landing nuestra) · manual (lo escribió una persona del equipo). NULL = anterior a 20260806000001, no se dedujo.';

-- El filtro del Inbox pregunta por origen sobre las conversaciones recientes.
CREATE INDEX IF NOT EXISTS whatsapp_messages_origen_idx
  ON whatsapp_messages (origen, created_at DESC) WHERE origen IS NOT NULL;

-- Backfill CONSERVADOR: solo lo que se sabe con certeza. Un mensaje atado a un
-- lead que tiene token de recorrido vino de una landing — no hay otra forma de
-- que ese lead exista. Todo lo demás queda en NULL a propósito.
UPDATE whatsapp_messages m
   SET origen = 'landing'
  FROM property_leads l
 WHERE m.lead_id = l.id
   AND m.origen IS NULL
   AND EXISTS (SELECT 1 FROM lead_access_tokens t WHERE t.lead_id = l.id);
