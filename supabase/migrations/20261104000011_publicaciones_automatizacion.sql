-- Publicaciones: cada video se puede conectar a una propiedad y responder comentarios
-- (público + privado) en Instagram y Facebook, con el mismo sistema de los reels de la ficha.

-- El video sabe de qué propiedad es, qué responde y con qué reel quedó conectado al publicarse.
ALTER TABLE public.publicacion_videos
  ADD COLUMN IF NOT EXISTS property_id uuid NULL REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.publicacion_videos ADD COLUMN IF NOT EXISTS automatizacion jsonb NULL;
ALTER TABLE public.publicacion_videos
  ADD COLUMN IF NOT EXISTS reel_id uuid NULL REFERENCES public.property_reels(id) ON DELETE SET NULL;
-- Por qué no se pudo conectar (el video salió igual): se ve en la fila con "Conectar de nuevo".
ALTER TABLE public.publicacion_videos ADD COLUMN IF NOT EXISTS automatizacion_error text NULL;

-- Una sola configuración para las dos redes: el reel guarda también el video y la publicación de Facebook.
ALTER TABLE public.property_reels ADD COLUMN IF NOT EXISTS fb_video_id text NULL;
ALTER TABLE public.property_reels ADD COLUMN IF NOT EXISTS fb_post_id text NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reels_fb_video_id_key') THEN
    ALTER TABLE public.property_reels ADD CONSTRAINT property_reels_fb_video_id_key UNIQUE (fb_video_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reels_fb_post_id_key') THEN
    -- Es por donde el webhook de la Página encuentra el reel.
    ALTER TABLE public.property_reels ADD CONSTRAINT property_reels_fb_post_id_key UNIQUE (fb_post_id);
  END IF;
END $$;

-- De qué red vino cada comentario. Los identificadores de Instagram y de Facebook no chocan
-- (los de Facebook llevan "_"), así que el UNIQUE de ig_comment_id sigue frenando el doble
-- registro ante un reintento de Meta.
ALTER TABLE public.reel_comentarios
  ADD COLUMN IF NOT EXISTS plataforma text NOT NULL DEFAULT 'instagram';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_comentarios_plataforma_check') THEN
    ALTER TABLE public.reel_comentarios
      ADD CONSTRAINT reel_comentarios_plataforma_check CHECK (plataforma IN ('instagram', 'facebook'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS publicacion_videos_property_idx ON public.publicacion_videos (property_id);
