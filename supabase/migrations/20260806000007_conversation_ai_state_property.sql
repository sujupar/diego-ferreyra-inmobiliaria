-- De qué PROPIEDAD es la memoria que el agente tiene guardada. 100% ADITIVA.
--
-- POR QUÉ EXISTE (bug real, 6 de agosto de 2026): `conversation_ai_state` tiene
-- UNA fila por teléfono, sin propiedad y sin fecha de corte, y cada análisis
-- reescribe el resumen pisando el anterior. Eso alcanzaba mientras una persona
-- hablaba de una sola propiedad. En cuanto la misma persona consultó por otra,
-- el resumen viejo siguió viajando: el 3 de agosto el agente le mandó fotos y un
-- video de Lares de Canning y dejó escrito "ya recibió fotos y un video"; el 6 de
-- agosto, con una consulta nueva por Entre Ríos, actualizó el nombre de la
-- propiedad pero se llevó puesta esa frase. Resultado: le ofreció el plano a
-- alguien que había pedido fotos, y después le afirmó que ya le había mandado un
-- video que nunca salió.
--
-- La memoria no es de un teléfono: es de una conversación sobre una propiedad.
-- Guardando cuál, el código puede decidir que un resumen ya no aplica.
--
-- SIGUE HABIENDO UNA FILA POR TELÉFONO a propósito: el Inbox, el panel de costo
-- y la prioridad leen esta tabla por teléfono, y volverla multi-fila los rompería
-- a los tres. Lo que cambia es que la fila ahora DICE de qué propiedad habla.
--
-- NO BORRA NADA. `property_id` NULL es un valor legítimo: conversaciones sin
-- propiedad conocida (un mensaje suelto, un contacto viejo) se comportan como
-- hasta ahora.
ALTER TABLE conversation_ai_state
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

COMMENT ON COLUMN conversation_ai_state.property_id IS
  'De qué propiedad habla el resumen guardado. Si entra un mensaje de OTRA propiedad, el resumen y el contador de mensajes del agente dejan de aplicar y se arranca de cero (lib/ai/conversation-memory.ts, memoriaVigente). NULL = no se sabe; se comporta como antes de 20260806000007.';

-- Backfill: la propiedad del mensaje más reciente que tenga una. Es la mejor
-- lectura posible del pasado y deja la columna útil desde el minuto uno, en vez
-- de esperar a que cada conversación se analice de nuevo.
UPDATE conversation_ai_state s
   SET property_id = (
         SELECT m.property_id
           FROM whatsapp_messages m
          WHERE m.phone_e164 = s.phone_e164
            AND m.property_id IS NOT NULL
          ORDER BY m.created_at DESC
          LIMIT 1)
 WHERE s.property_id IS NULL;

-- Los resúmenes que YA pueden estar contaminados: los de un teléfono que habló
-- de más de una propiedad. Son los únicos casos donde el bug pudo mezclar dos
-- conversaciones, y no hay forma de saber qué parte del texto corresponde a cuál.
--
-- Se vacía SOLO el resumen (un texto derivado que el próximo análisis reescribe
-- igual). Los mensajes, los contadores de costo y el historial no se tocan: el
-- dato real está en `whatsapp_messages` y sigue entero.
UPDATE conversation_ai_state s
   SET summary = '',
       updated_at = NOW()
 WHERE s.summary <> ''
   AND (SELECT COUNT(DISTINCT m.property_id)
          FROM whatsapp_messages m
         WHERE m.phone_e164 = s.phone_e164
           AND m.property_id IS NOT NULL) > 1;
