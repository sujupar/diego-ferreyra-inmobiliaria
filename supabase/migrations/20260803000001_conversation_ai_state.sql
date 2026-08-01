-- Memoria de la IA por conversación. 100% ADITIVA.
--
-- POR QUÉ EXISTE: sin esto, saber "cómo viene" una conversación obligaría a
-- mandarle el hilo COMPLETO a un modelo cada vez que se refresca la pantalla.
-- Con 300 conversaciones y refresco cada 15s eso son millones de tokens por día
-- para leer, casi siempre, exactamente lo mismo.
--
-- Esta tabla guarda el ESTADO ACUMULADO: un resumen corto que se reescribe en la
-- misma llamada que lo analiza, y hasta dónde se leyó. El próximo análisis manda
-- resumen + mensajes nuevos, nunca el hilo entero.
CREATE TABLE IF NOT EXISTS conversation_ai_state (
  phone_e164   TEXT PRIMARY KEY,
  -- Resumen acumulado. Corto A PROPÓSITO: es lo que se paga en CADA análisis.
  summary      TEXT NOT NULL DEFAULT '',
  -- Hasta dónde se leyó. Es la pieza que contiene el costo: sin esto, cada
  -- análisis re-leería mensajes ya analizados.
  last_analyzed_message_id UUID REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  last_analyzed_at TIMESTAMPTZ,

  intent       TEXT NOT NULL DEFAULT 'desconocido'
               CHECK (intent IN ('agendar','consulta','frio','desconocido')),
  -- 0-100. Se COMBINA con el tiempo que falta para que cierre la ventana de
  -- 24hs, que se calcula sin IA (es una resta de fechas).
  priority_score INTEGER NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  -- Una frase, en castellano, que se le MUESTRA al asesor. Sin el porqué, nadie
  -- confía en un orden automático.
  priority_reason TEXT,
  suggested_next_step TEXT,

  -- Freno del agente que escribe: cuántos mensajes mandó ya en esta conversación.
  agent_messages_sent INTEGER NOT NULL DEFAULT 0,
  agent_handed_off    BOOLEAN NOT NULL DEFAULT false,

  -- Observabilidad del costo. Sin esto el gasto de IA es invisible hasta la factura.
  tokens_used_total   BIGINT NOT NULL DEFAULT 0,
  analyses_count      INTEGER NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversation_ai_state IS 'Estado acumulado de la IA por conversación de WhatsApp. Existe para NO releer el hilo completo en cada análisis.';
COMMENT ON COLUMN conversation_ai_state.agent_handed_off IS 'true = el agente llegó a su tope de mensajes sin cerrar y le pasó la conversación a un humano. Deja de escribir.';

CREATE INDEX IF NOT EXISTS conversation_ai_state_priority_idx
  ON conversation_ai_state (priority_score DESC, last_analyzed_at DESC);

ALTER TABLE conversation_ai_state ENABLE ROW LEVEL SECURITY;
-- OJO: esta política decía `NOT public.is_lawyer()` (cualquier logueado que no
-- fuera abogado). La revisión adversarial del 2026-08-03 mostró que era más
-- laxa que la de `whatsapp_messages`, que es de donde salen estos resúmenes —
-- se corrigió en `20260803000005_conversation_ai_state_rls.sql`. Se actualiza
-- TAMBIÉN acá porque `scripts/apply-ai-agent-migration-pg.ts` re-ejecuta este
-- archivo completo: con el texto viejo, una simple re-verificación revertía en
-- silencio el arreglo de seguridad. Las dos versiones tienen que coincidir.
DROP POLICY IF EXISTS conversation_ai_state_read ON conversation_ai_state;
CREATE POLICY conversation_ai_state_read ON conversation_ai_state
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- Freno de mano del agente que ESCRIBE. Arranca apagado: un bot hablando con
-- clientes reales se prende cuando el dueño vio cómo redacta, no antes.
CREATE TABLE IF NOT EXISTS ai_agent_settings (
  id                  BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  scheduling_enabled  BOOLEAN NOT NULL DEFAULT false,
  max_messages_per_conversation INTEGER NOT NULL DEFAULT 3,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO ai_agent_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE ai_agent_settings IS 'Interruptor global del agente que escribe. `scheduling_enabled` arranca en false a propósito.';

ALTER TABLE ai_agent_settings ENABLE ROW LEVEL SECURITY;
-- Mismo caso que la política de arriba: endurecida en `20260803000005` y
-- replicada acá para que re-ejecutar este archivo no la afloje de vuelta.
DROP POLICY IF EXISTS ai_agent_settings_read ON ai_agent_settings;
CREATE POLICY ai_agent_settings_read ON ai_agent_settings
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- Por propiedad se puede apagar aunque el global esté prendido.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ai_scheduling_enabled BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN properties.ai_scheduling_enabled IS 'Permite apagar el agente para UNA propiedad. El interruptor global manda: si está apagado, esto no importa.';
