-- Marca de "esta visita la agendó el agente de IA" en property_visits
-- (cierre de la limitación que dejó anotada la task 5). 100% ADITIVA.
--
-- POR QUÉ EXISTE: el agente que agenda (`lib/ai/scheduling-agent.ts`) crea la
-- visita por el MISMO camino que usa el cliente cuando agenda solo desde
-- `/v/<token>` (`lib/leads/visit-scheduling.ts` — "reusa esa ruta, no la
-- dupliques"). Sin esta columna no hay forma de distinguir una de otra, y el
-- panel de costo tenía que DEDUCIR cuáles eran del agente cruzando teléfonos
-- (ver `summarizeAgentVisits` en `lib/admin/ai-usage.ts`): un número
-- aproximado presentado como exacto. Con esta columna el conteo es un hecho,
-- no una inferencia.
--
-- ORDEN DE DEPLOY: el código NUNCA manda esta columna salvo cuando la visita
-- la crea el agente (`createdByAi: true`), y el agente arranca APAGADO. Así
-- que si esta migración todavía no corrió, el flujo del recorrido
-- (`/v/<token>/schedule`, que hoy usan clientes reales) sigue funcionando
-- igual — no hay ventana de deploy que lo rompa. Correrla ANTES de prender
-- `ai_agent_settings.scheduling_enabled`.
ALTER TABLE property_visits ADD COLUMN IF NOT EXISTS created_by_ai BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN property_visits.created_by_ai IS
  'true = la agendó el agente de IA por WhatsApp (lib/ai/scheduling-agent.ts). false = la agendó una persona (asesor) o el propio cliente desde /v/<token>.';

-- Índice parcial: el panel de costo pregunta SOLO por las del agente, que van
-- a ser una minoría de la tabla.
CREATE INDEX IF NOT EXISTS property_visits_created_by_ai_idx
  ON property_visits (created_at DESC) WHERE created_by_ai = true;
