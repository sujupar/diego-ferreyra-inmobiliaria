-- Asistente de IA de la tasación (spec 2026-10-03-asistente-ia-tasacion-design.md).
-- Conversaciones por tasación: varios hilos, mensajes con bloques estructurados,
-- adjuntos en un bucket privado y propuestas de ajuste que se aplican a mano.
--
-- Escritura: SOLO desde las rutas /api/appraisals/[id]/asistente (service role),
-- que validan canAccessAppraisal + puedeEditarTasacion. Lectura directa con RLS:
-- quien ve la tasación ve sus conversaciones (son compartidas por decisión del
-- dueño, 2026-10-10). La subconsulta a `appraisals` usa SU RLS por rol, así que
-- el acceso a los chats sigue exactamente al de la tasación.

CREATE TABLE IF NOT EXISTS appraisal_chat_threads (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id  uuid NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
    title         text NOT NULL DEFAULT 'Nueva conversación',
    created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    archived_at   timestamptz
);
CREATE INDEX IF NOT EXISTS appraisal_chat_threads_appraisal_idx
    ON appraisal_chat_threads (appraisal_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS appraisal_chat_messages (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id              uuid NOT NULL REFERENCES appraisal_chat_threads(id) ON DELETE CASCADE,
    role                   text NOT NULL CHECK (role IN ('user', 'assistant')),
    -- Mensaje del asesor: texto. Respuesta: bloques (resumen/pasos/tabla/texto/borrador).
    texto                  text NOT NULL DEFAULT '',
    bloques                jsonb,
    -- [{path, tipo, nombre, tamano}] — path dentro del bucket appraisal-chat.
    adjuntos               jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Ajuste propuesto por el asistente; nunca se aplica solo.
    propuesta              jsonb,
    propuesta_aplicada_at  timestamptz,
    propuesta_aplicada_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
    status                 text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed')),
    error                  text,
    model                  text,
    usage                  jsonb,
    created_by             uuid REFERENCES profiles(id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appraisal_chat_messages_thread_idx
    ON appraisal_chat_messages (thread_id, created_at);

ALTER TABLE appraisal_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appraisal_chat_threads_select ON appraisal_chat_threads;
CREATE POLICY appraisal_chat_threads_select ON appraisal_chat_threads
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM appraisals a WHERE a.id = appraisal_chat_threads.appraisal_id));

DROP POLICY IF EXISTS appraisal_chat_messages_select ON appraisal_chat_messages;
CREATE POLICY appraisal_chat_messages_select ON appraisal_chat_messages
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM appraisal_chat_threads t
        JOIN appraisals a ON a.id = t.appraisal_id
        WHERE t.id = appraisal_chat_messages.thread_id
    ));

-- Bucket privado: capturas de chats con propietarios, documentos. Solo URLs firmadas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('appraisal-chat', 'appraisal-chat', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
