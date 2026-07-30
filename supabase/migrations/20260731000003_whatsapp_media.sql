-- Multimedia entrante de WhatsApp (task 9, chat profesional). 100% ADITIVA.
--
-- Hasta hoy, un cliente que mandaba una foto/audio/documento por WhatsApp
-- quedaba guardado SOLO como texto descriptivo ("[imagen]", "[audio]") — el
-- archivo real de Meta nunca se descargaba ni se guardaba. Estas columnas
-- permiten que el webhook (`app/api/webhooks/whatsapp/route.ts`) guarde,
-- además del preview de texto, el path real en Storage para que el chat lo
-- pueda mostrar (imagen/audio/video inline, documento como link).

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_filename TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_type TEXT;

COMMENT ON COLUMN whatsapp_messages.media_url IS 'PATH dentro del bucket privado whatsapp-media (NO url pública) — se firma al leer el hilo. NULL si el mensaje no trae multimedia o si la descarga desde Meta falló (el mensaje igual se guarda, con el fallback de texto en body_preview).';
COMMENT ON COLUMN whatsapp_messages.media_mime_type IS 'Mime type real del archivo descargado (ej. image/jpeg), para que el chat sepa cómo renderizarlo.';
COMMENT ON COLUMN whatsapp_messages.media_filename IS 'Nombre original SOLO para documentos (Meta lo manda en document.filename). NULL para el resto.';
COMMENT ON COLUMN whatsapp_messages.media_type IS 'image|audio|video|document|sticker — mismo vocabulario que InboundMessageType (webhook.ts). NULL si no es multimedia.';

-- Bucket privado: el binario de un cliente no es público. El chat lee vía
-- signed URL generada server-side (mismo patrón que otros buckets privados,
-- ej. social-carousels).
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO NOTHING;

-- Lectura: mismo criterio que la tabla whatsapp_messages (is_operations_user).
-- La app en realidad lee/escribe con service role (bypassa RLS) y hace el
-- gate de rol en código — esta policy es defensa en profundidad, no la
-- autorización real.
DROP POLICY IF EXISTS whatsapp_media_storage_read ON storage.objects;
CREATE POLICY whatsapp_media_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-media' AND public.is_operations_user());
