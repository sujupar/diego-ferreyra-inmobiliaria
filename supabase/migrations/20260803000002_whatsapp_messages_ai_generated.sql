-- Marca de "esto lo escribió el agente de IA" en whatsapp_messages (task 3,
-- 2026-08-03). 100% ADITIVA.
--
-- POR QUÉ EXISTE: el agente que agenda (`lib/ai/scheduling-agent.ts`) manda
-- mensajes de texto libre con `sent_by = NULL` (no hay un profile humano
-- detrás) — igual que un envío automático por cron. Sin esta columna, un
-- asesor mirando el chat no puede distinguir "esto lo mandó el bot" de
-- "esto lo mandó un sistema automático sin dueño claro". Ver CLAUDE.md /
-- brief de la tarea: "todo lo que escribe la IA queda registrado con
-- sent_by = null y alguna marca de que lo generó la IA".
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN whatsapp_messages.ai_generated IS
  'true = lo escribió el agente de IA que agenda (lib/ai/scheduling-agent.ts), no una persona. sent_by es NULL en estas filas.';

CREATE INDEX IF NOT EXISTS whatsapp_messages_ai_generated_idx
  ON whatsapp_messages (phone_e164, created_at DESC) WHERE ai_generated = true;
