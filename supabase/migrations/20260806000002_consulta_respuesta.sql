-- Interruptor y lista blanca de la respuesta instantánea a consultas. ADITIVA.
--
-- ARRANCA APAGADO, igual que el agente. Este sistema le escribe a personas que
-- nunca nos escribieron —dejaron una consulta en un portal— así que el freno
-- vale todavía más que en el chat.
ALTER TABLE ai_agent_settings
  ADD COLUMN IF NOT EXISTS consulta_respuesta_enabled BOOLEAN NOT NULL DEFAULT false;

-- LISTA BLANCA DE PRUEBA. Si tiene números, el sistema le escribe SOLO a esos,
-- aunque el interruptor esté prendido y la consulta sea perfecta.
--
-- Es lo que permite estrenar esto con gente real del otro lado sin arriesgar
-- una mala primera impresión: el dueño consulta desde su propio teléfono, ve la
-- conversación completa, y recién cuando le cierra se vacía la lista.
--
-- Vacía = sin restricción (comportamiento normal). El default es vacío a
-- propósito: el freno que importa es `consulta_respuesta_enabled`, y una lista
-- vacía con el interruptor apagado no le escribe a nadie igual.
ALTER TABLE ai_agent_settings
  ADD COLUMN IF NOT EXISTS consulta_test_phones TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN ai_agent_settings.consulta_respuesta_enabled IS
  'Interruptor de la respuesta instantánea a consultas de portales. Arranca en false.';
COMMENT ON COLUMN ai_agent_settings.consulta_test_phones IS
  'Modo prueba: si tiene números (E.164 sin +), SOLO a ellos se les manda el WhatsApp automático. Vacío = sin restricción.';
