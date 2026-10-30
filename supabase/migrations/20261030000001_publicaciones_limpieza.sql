-- Publicaciones (fase 2): cuándo se borró el archivo del video de Storage.
-- La limpieza lo borra 30 días después de que todas sus redes terminaron; esta
-- marca evita volver a intentarlo y le dice a la pantalla que ya no hay video
-- para reproducir (la miniatura y los enlaces quedan).
ALTER TABLE public.publicacion_videos ADD COLUMN IF NOT EXISTS archivo_borrado_at timestamptz NULL;

-- El publicador busca envíos por estado y próximo intento en cada corrida.
CREATE INDEX IF NOT EXISTS publicacion_envios_pendientes_idx
  ON public.publicacion_envios (plataforma, estado, proximo_intento)
  WHERE estado IN ('programado', 'en_curso');
