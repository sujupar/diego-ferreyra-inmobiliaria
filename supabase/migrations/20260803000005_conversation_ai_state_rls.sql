-- Hallazgo 6 (revisión adversarial 2026-08-03, agente de IA que agenda visitas):
-- `conversation_ai_state` y `ai_agent_settings` (migración 20260803000001, YA
-- APLICADA EN PRODUCCIÓN — por eso el arreglo va acá y no allá) quedaron
-- legibles por CUALQUIER autenticado que no sea abogado (`NOT
-- public.is_lawyer()`), que es MÁS LAXO que la tabla de donde salen esos datos.
--
-- La fuente es `whatsapp_messages` (migración 20260730000001), restringida a
-- operaciones: `USING (public.is_operations_user())`, con el argumento de que
-- las filas tienen teléfono y texto de clientes. Pero `conversation_ai_state`
-- guarda el DESTILADO de esas mismas conversaciones — el resumen acumulado, el
-- motivo de prioridad y el "próximo paso sugerido", todo en castellano y sobre
-- un cliente concreto. O sea: la información sensible se protegía en la tabla
-- larga y se regalaba en la corta. Con su propio JWT (acceso directo a la REST
-- API de Supabase, no la app), un asesor podía leer el resumen de IA de los
-- clientes de TODOS los demás asesores.
--
-- Se alinea con la fuente: `is_operations_user()`, misma convención exacta que
-- `whatsapp_messages_ops_read`. NO se scopea por asesor como en
-- `lead_tag_assignments` (hallazgo H9, migración 20260801000004) porque la PK
-- de esta tabla es el TELÉFONO, no un `lead_id`: no hay FK por la cual llegar
-- al dueño sin inventar un join por teléfono dentro de una policy (lento y
-- frágil). El criterio de la tabla origen es el que manda.
--
-- `ai_agent_settings` va igual: es el interruptor del bot que le escribe a los
-- clientes. Saber si está prendido y con qué tope de mensajes es información de
-- operaciones, no de cualquier usuario logueado.
--
-- NINGUNA ruta de la app deja de andar — verificado leyendo los dos únicos
-- consumidores y las dos librerías que la escriben, TODOS con service role
-- (que ignora RLS por definición):
--   - `app/api/admin/ai-usage/route.ts`      → createClient(..., SUPABASE_SERVICE_ROLE_KEY) + gate `settings.manage`
--   - `app/api/whatsapp/conversations/route.ts` → ídem, + su propio filtro de ownership para el rol asesor
--   - `lib/ai/conversation-memory.ts`        → ídem (admin())
--   - `lib/ai/scheduling-agent.ts`           → ídem (admin() de lib/leads/visit-scheduling.ts)
-- Esto es defensa en profundidad contra el acceso directo con el JWT del
-- usuario, no un cambio de comportamiento de la app. El Inbox le sigue
-- mostrando al asesor el resumen de IA de SUS conversaciones, porque ese dato
-- se lo sirve la ruta (service role), no una lectura directa del navegador.
--
-- OJO al aplicar: es reemplazo de política existente (`DROP POLICY IF EXISTS` +
-- `CREATE POLICY`), no aditivo puro — pero no toca datos, columnas ni el estado
-- del agente (que sigue APAGADO: esta migración no roza `scheduling_enabled`).
-- Es seguro re-ejecutarlo.

DROP POLICY IF EXISTS conversation_ai_state_read ON conversation_ai_state;
CREATE POLICY conversation_ai_state_read ON conversation_ai_state
  FOR SELECT TO authenticated USING (public.is_operations_user());

DROP POLICY IF EXISTS ai_agent_settings_read ON ai_agent_settings;
CREATE POLICY ai_agent_settings_read ON ai_agent_settings
  FOR SELECT TO authenticated USING (public.is_operations_user());

COMMENT ON POLICY conversation_ai_state_read ON conversation_ai_state IS
  'Solo operaciones (admin/dueño/coordinador), MISMO criterio que whatsapp_messages_ops_read: acá vive el resumen destilado de esas conversaciones. Endurecido en 20260803000005 (hallazgo 6) — antes era NOT is_lawyer(), o sea cualquier logueado.';
COMMENT ON POLICY ai_agent_settings_read ON ai_agent_settings IS
  'Solo operaciones: es el interruptor del bot que le escribe a clientes reales. Endurecido en 20260803000005 (hallazgo 6).';
