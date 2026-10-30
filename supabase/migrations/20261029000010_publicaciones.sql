-- Publicaciones (fase 1): tandas de videos, sus envíos por red, conexiones y ajustes.
--
-- Todo se escribe desde el servidor con service role: NO hay políticas de escritura.
-- Lectura solo para operaciones (admin/dueño/coordinador) vía is_operations_user().
-- `publicacion_conexiones` guarda tokens de las redes: RLS prendida y SIN ninguna
-- política, así ni siquiera un usuario logueado los puede leer.
--
-- Idempotente: se puede volver a correr (lo hace el script de verificación).

CREATE TABLE IF NOT EXISTS public.publicacion_tandas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estado       text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'confirmada')),
  ritmo        jsonb NULL,
  inicio       date NULL,
  solo_habiles boolean NOT NULL DEFAULT false,
  creada_por   uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publicacion_videos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanda_id            uuid NOT NULL REFERENCES public.publicacion_tandas(id) ON DELETE CASCADE,
  orden               int NOT NULL,
  origen              text NOT NULL DEFAULT 'subida' CHECK (origen IN ('subida', 'drive')),
  drive_file_id       text NULL,
  nombre_archivo      text NOT NULL,
  tamano_bytes        bigint NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 209715200),
  video_path          text NULL,
  miniatura_path      text NULL,
  audio_path          text NULL,
  duracion_seg        numeric NULL,
  etapa               text NOT NULL DEFAULT 'subiendo'
                        CHECK (etapa IN ('subiendo', 'extrayendo', 'transcribiendo', 'describiendo', 'listo', 'error')),
  error_etapa         text NULL,
  ultimo_error        text NULL,
  transcripcion       jsonb NULL,          -- [{inicio, fin, texto}]
  descripcion         text NOT NULL DEFAULT '',
  descripcion_editada boolean NOT NULL DEFAULT false,
  titulo_youtube      text NOT NULL DEFAULT '',
  redes               text[] NOT NULL DEFAULT '{instagram,facebook,youtube,tiktok}'
                        CHECK (redes <@ ARRAY['instagram', 'facebook', 'youtube', 'tiktok']::text[]),
  programado_para     timestamptz NULL,
  hora_manual         boolean NOT NULL DEFAULT false,
  pausado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publicacion_videos_tanda_idx ON public.publicacion_videos (tanda_id, orden);
CREATE INDEX IF NOT EXISTS publicacion_videos_programado_idx ON public.publicacion_videos (programado_para);

CREATE TABLE IF NOT EXISTS public.publicacion_envios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id         uuid NOT NULL REFERENCES public.publicacion_videos(id) ON DELETE CASCADE,
  plataforma       text NOT NULL CHECK (plataforma IN ('instagram', 'facebook', 'youtube', 'tiktok')),
  estado           text NOT NULL DEFAULT 'programado'
                     CHECK (estado IN ('programado', 'en_curso', 'publicado', 'fallido', 'cancelado')),
  etapa            text NULL,
  ids_externos     jsonb NOT NULL DEFAULT '{}'::jsonb,
  enlace           text NULL,
  intentos         int NOT NULL DEFAULT 0,
  proximo_intento  timestamptz NULL,
  ultimo_error     text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Tocar dos veces "Programar" no puede duplicar publicaciones.
  CONSTRAINT publicacion_envios_video_plataforma_key UNIQUE (video_id, plataforma)
);
CREATE INDEX IF NOT EXISTS publicacion_envios_estado_idx ON public.publicacion_envios (estado, proximo_intento);

CREATE TABLE IF NOT EXISTS public.publicacion_conexiones (
  plataforma     text PRIMARY KEY CHECK (plataforma IN ('instagram', 'facebook', 'youtube', 'tiktok', 'drive')),
  cuenta         text NULL,
  tokens         jsonb NULL,
  conectada_por  uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publicacion_ajustes (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  publicacion_automatica boolean NOT NULL DEFAULT false,
  horarios               jsonb NOT NULL DEFAULT
    '{"1":["19:00"],"2":["12:30","19:00"],"3":["09:00","13:00","19:00"],"semana":["19:00"]}'::jsonb,
  estilo                 jsonb NOT NULL DEFAULT '{"etapa":"sin_aprender"}'::jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.publicacion_ajustes (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- updated_at: la función ya existe en el repo (solo modifica NEW).
DROP TRIGGER IF EXISTS trg_publicacion_tandas_touch ON public.publicacion_tandas;
CREATE TRIGGER trg_publicacion_tandas_touch BEFORE UPDATE ON public.publicacion_tandas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_publicacion_videos_touch ON public.publicacion_videos;
CREATE TRIGGER trg_publicacion_videos_touch BEFORE UPDATE ON public.publicacion_videos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_publicacion_envios_touch ON public.publicacion_envios;
CREATE TRIGGER trg_publicacion_envios_touch BEFORE UPDATE ON public.publicacion_envios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_publicacion_conexiones_touch ON public.publicacion_conexiones;
CREATE TRIGGER trg_publicacion_conexiones_touch BEFORE UPDATE ON public.publicacion_conexiones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_publicacion_ajustes_touch ON public.publicacion_ajustes;
CREATE TRIGGER trg_publicacion_ajustes_touch BEFORE UPDATE ON public.publicacion_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.publicacion_tandas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_videos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_envios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_ajustes    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publicacion_tandas_select ON public.publicacion_tandas;
CREATE POLICY publicacion_tandas_select ON public.publicacion_tandas
  FOR SELECT TO authenticated USING (public.is_operations_user());
DROP POLICY IF EXISTS publicacion_videos_select ON public.publicacion_videos;
CREATE POLICY publicacion_videos_select ON public.publicacion_videos
  FOR SELECT TO authenticated USING (public.is_operations_user());
DROP POLICY IF EXISTS publicacion_envios_select ON public.publicacion_envios;
CREATE POLICY publicacion_envios_select ON public.publicacion_envios
  FOR SELECT TO authenticated USING (public.is_operations_user());
DROP POLICY IF EXISTS publicacion_ajustes_select ON public.publicacion_ajustes;
CREATE POLICY publicacion_ajustes_select ON public.publicacion_ajustes
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- Bucket PÚBLICO: Meta, YouTube y TikTok descargan el video desde una URL pública,
-- y el navegador lee la miniatura/audio para retomar una tanda. Las rutas llevan
-- dos UUID (tanda y video), no se pueden adivinar. Sin políticas en storage.objects:
-- las subidas van por URL firmada que emite el servidor.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contenido-videos', 'contenido-videos', true, 209715200,
        ARRAY['video/mp4', 'video/quicktime', 'audio/wav', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
