-- Interruptor propio del ANÁLISIS + apagar por default las 41 propiedades.
-- Vuelta de cierre del agente de IA (2026-08-03), justo antes de mergear a main.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — `ai_agent_settings.analysis_enabled` (aditiva pura)
-- ─────────────────────────────────────────────────────────────────────────────
-- El agente tiene DOS mitades y hasta hoy solo una tenía freno de mano:
--
--   `runSchedulingAgent` (el que ESCRIBE)  → `scheduling_enabled`, default false ✅
--   `runConversationAnalysis` (el que LEE) → NINGÚN interruptor              ❌
--
-- El análisis corre ANTES, en el mismo webhook, y hace una llamada REAL al
-- modelo por cada mensaje entrante de WhatsApp (hasta 12s de `ANALYSIS_TIMEOUT_MS`
-- pegados al request que Meta espera). La API key ya está configurada en
-- producción: sin esta columna, el merge a main prendía el gasto de IA sobre
-- clientes reales sin que nadie lo decidiera. El dueño fue explícito: esto
-- arranca apagado y lo prende él.
--
-- Va SEPARADO de `scheduling_enabled` a propósito. Son dos decisiones distintas
-- y con costos distintos: analizar es leer y ordenar la bandeja (cuesta tokens,
-- no le habla a nadie); agendar es un bot escribiéndole a un cliente real. Se
-- puede querer lo primero sin lo segundo — de hecho ese es el orden natural para
-- estrenar esto: primero mirar cómo prioriza, después dejarlo hablar.
ALTER TABLE ai_agent_settings
  ADD COLUMN IF NOT EXISTS analysis_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_agent_settings.analysis_enabled IS
  'Interruptor del ANÁLISIS de conversaciones (lib/ai/analyze-conversation.ts). Arranca en false: cada mensaje entrante dispara una llamada paga al modelo dentro del webhook. Independiente de scheduling_enabled (analizar es leer; agendar es escribirle a un cliente).';

COMMENT ON TABLE ai_agent_settings IS
  'Interruptores globales de la IA. `analysis_enabled` (el que LEE) y `scheduling_enabled` (el que ESCRIBE) arrancan los dos en false a propósito.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — `properties.ai_scheduling_enabled`: default false + apagar las filas
-- ─────────────────────────────────────────────────────────────────────────────
-- Esta columna nació con `DEFAULT true` (migración 20260803000001), así que las
-- 41 propiedades de la base están HOY en `true`. Consecuencia: el día que el
-- dueño quiera probar el agente en UNA propiedad, prender el interruptor global
-- se lo prende en LAS 41 de golpe. Eso contradice el "arranca apagado" y, peor,
-- no deja estrenar de a poco — que es justo como hay que estrenar un bot que le
-- escribe a clientes reales.
--
-- POR QUÉ ESTA ESCRITURA SOBRE DATOS ES SEGURA (es la única del archivo):
--   1. La columna hoy no hace NADA. El único que la lee es `runSchedulingAgent`,
--      y `scheduling_enabled` está en false: el agente ni llega a mirarla.
--   2. El cambio va en la dirección segura. Apagar de más, nunca prender de más:
--      el peor caso es que el agente se quede callado, que es exactamente el
--      estado actual del sistema.
--   3. Nadie perdió una configuración: ningún `true` de estos lo eligió una
--      persona, son todos el default de la migración de hace unos días. No hay
--      UI ni endpoint que escriba esta columna (verificado con grep).
--
-- PARA ESTRENAR: hay que prender EXPLÍCITAMENTE la propiedad elegida, además del
-- interruptor global. O sea, y en este orden:
--   UPDATE properties SET ai_scheduling_enabled = true WHERE id = '<la propiedad de prueba>';
--   UPDATE ai_agent_settings SET analysis_enabled = true WHERE id;
--   UPDATE ai_agent_settings SET scheduling_enabled = true WHERE id;   -- recién al final
--
-- El `DO $$` no es adorno: el UPDATE masivo tiene que correr UNA SOLA VEZ EN LA
-- HISTORIA. Si alguien re-ejecuta este archivo (los scripts `apply-*-pg.ts` de
-- este repo re-ejecutan migraciones enteras para verificar) después de que el
-- dueño prendió su propiedad de prueba, un UPDATE suelto se la apagaría en
-- silencio y el agente quedaría mudo sin que nadie entendiera por qué. El
-- default viejo de la columna (`'true'`) es la marca de "esta migración todavía
-- no corrió": se lee de `information_schema`, se hace el trabajo, y se pisa el
-- default en la misma transacción. La segunda corrida no encuentra la marca y no
-- toca ni una fila.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'ai_scheduling_enabled'
      AND column_default = 'true'
  ) THEN
    UPDATE properties SET ai_scheduling_enabled = false WHERE ai_scheduling_enabled;
    ALTER TABLE properties ALTER COLUMN ai_scheduling_enabled SET DEFAULT false;
    RAISE NOTICE 'ai_scheduling_enabled: default a false y filas existentes apagadas (primera corrida).';
  ELSE
    RAISE NOTICE 'ai_scheduling_enabled: ya estaba en false por default — no se toca ninguna fila.';
  END IF;
END $$;

COMMENT ON COLUMN properties.ai_scheduling_enabled IS
  'Permite prender el agente para UNA propiedad. Default false desde 20260803000006: se estrena propiedad por propiedad. El interruptor global manda: si está apagado, esto no importa.';
