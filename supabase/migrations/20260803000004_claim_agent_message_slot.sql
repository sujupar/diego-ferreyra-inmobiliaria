-- Reserva ATÓMICA de un cupo del tope de mensajes automáticos del agente que
-- agenda (`lib/ai/scheduling-agent.ts`). 100% ADITIVA: no borra ni modifica
-- ninguna fila, solo agrega una función.
--
-- POR QUÉ EXISTE: el freno de "máximo N mensajes por conversación" se
-- implementaba leyendo `agent_messages_sent`, mandando, y recién después
-- escribiendo `n + 1`. Dos mensajes seguidos del cliente son DOS webhooks
-- concurrentes: los dos leían `0`, los dos mandaban el MISMO texto, y el
-- contador quedaba en 1 en vez de 2. El cliente recibía el mensaje duplicado y
-- el tope se estiraba de a poco. Un freno que se puede saltear por una carrera
-- no es un freno.
--
-- El arreglo es claim-before-send: el agente RESERVA el cupo con esta función
-- ANTES de llamar a Meta y solo manda si la función devolvió un número. Todo
-- pasa en UNA sentencia UPDATE, así que dos webhooks concurrentes se serializan
-- sobre la fila: el segundo se bloquea, re-evalúa el WHERE contra la versión ya
-- incrementada (READ COMMITTED) y obtiene el número siguiente — o nada, si con
-- eso se llegó al tope.
--
-- Fail-closed por construcción: si la fila de `conversation_ai_state` no existe
-- todavía, el UPDATE no toca nada y devuelve NULL → el agente no manda. Igual
-- que si la conversación ya está `agent_handed_off`.
CREATE OR REPLACE FUNCTION public.claim_agent_message_slot(p_phone TEXT, p_max INTEGER)
RETURNS INTEGER
LANGUAGE sql
-- SECURITY DEFINER: `conversation_ai_state` tiene RLS y solo política de
-- SELECT. El agente corre con el service role (que la puentea igual), pero
-- dejarlo explícito evita que un cambio futuro de RLS convierta el freno en un
-- "no se pudo reservar" permanente sin que nadie se entere.
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversation_ai_state
     SET agent_messages_sent = agent_messages_sent + 1,
         updated_at = now()
   WHERE phone_e164 = p_phone
     AND NOT agent_handed_off
     AND agent_messages_sent < p_max
  RETURNING agent_messages_sent;
$$;

COMMENT ON FUNCTION public.claim_agent_message_slot(TEXT, INTEGER) IS
  'Reserva un cupo del tope de mensajes automáticos del agente de IA y devuelve el número reservado. NULL = sin cupo (o conversación ya pasada a un humano, o sin estado): el agente NO manda. Se llama ANTES del envío — si el envío falla después, el cupo queda consumido, que es el lado seguro del error.';

-- Nadie más que el backend la ejecuta: el agente es la ÚNICA pieza que le
-- escribe a un cliente por su cuenta, y su contador no se toca desde el navegador.
REVOKE ALL ON FUNCTION public.claim_agent_message_slot(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_agent_message_slot(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_agent_message_slot(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_message_slot(TEXT, INTEGER) TO service_role;
