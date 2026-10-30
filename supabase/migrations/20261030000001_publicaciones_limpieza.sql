-- Publicaciones (fase 2): cuándo se borró el archivo del video de Storage.
-- La limpieza lo borra 30 días después de que todas sus redes terminaron; esta
-- marca evita volver a intentarlo y le dice a la pantalla que ya no hay video
-- para reproducir (la miniatura y los enlaces quedan).
ALTER TABLE public.publicacion_videos ADD COLUMN IF NOT EXISTS archivo_borrado_at timestamptz NULL;

-- Videos cuyo archivo ya se puede borrar: TODAS sus redes publicadas o canceladas,
-- la última hace más de 30 días. El filtro va en SQL a propósito: filtrando en el
-- servidor, 20 videos con una red pendiente para siempre (YouTube/TikTok antes de
-- sus fases, o un fallido) ocupaban los 20 lugares y nunca se borraba nada más.
CREATE OR REPLACE FUNCTION public.publicacion_videos_para_limpiar(limite int, antes timestamptz)
RETURNS TABLE (id uuid, video_path text, audio_path text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT v.id, v.video_path, v.audio_path
    FROM public.publicacion_videos v
   WHERE v.archivo_borrado_at IS NULL
     AND v.video_path IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.publicacion_envios e WHERE e.video_id = v.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.publicacion_envios e
        WHERE e.video_id = v.id
          AND (e.estado NOT IN ('publicado', 'cancelado') OR e.updated_at > antes)
     )
   ORDER BY v.created_at
   LIMIT limite
$$;
REVOKE ALL ON FUNCTION public.publicacion_videos_para_limpiar(int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicacion_videos_para_limpiar(int, timestamptz) TO service_role;

-- El publicador busca envíos por estado y próximo intento en cada corrida.
CREATE INDEX IF NOT EXISTS publicacion_envios_pendientes_idx
  ON public.publicacion_envios (plataforma, estado, proximo_intento)
  WHERE estado IN ('programado', 'en_curso');
