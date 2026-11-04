-- Sección Referencias de video: una fila por video (o tema/hipótesis) de referencia
-- que el Reportero encuentra y que el usuario puede pasar a guion.
-- Incluye el backfill de fichas existentes (`ficha_slug` único, upsert on_conflict=ficha_slug),
-- por eso el índice sobre ficha_slug es ÚNICO: re-correr el backfill no duplica filas.
-- Correr a mano en el SQL Editor del Dashboard. Idempotente.

CREATE TABLE IF NOT EXISTS public.video_refs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  cuenta            text,
  plataforma        text,
  url_video         text,
  fecha_video       date,
  vistas            bigint,
  likes             bigint,
  comentarios       bigint,
  multiplicador     numeric,
  baseline_cuenta   text,
  seguidores        bigint,
  tema              text,
  por_que           text,
  gancho            text,
  adaptacion_diego  text,
  tipo              text CHECK (tipo IN ('video_cuenta','tema_tendencia','hipotesis_prensa')),
  estado_uso        text CHECK (estado_uso IN ('sin_usar','guionizando','usada','error')) DEFAULT 'sin_usar',
  thumbnail_url     text,
  ficha_slug        text,
  guion             text,
  guion_error       text,
  avisado_at        timestamptz,
  creado_por        uuid
);

-- Listado por estado de uso (sin_usar / guionizando / usada / error).
CREATE INDEX IF NOT EXISTS video_refs_estado_uso_idx ON public.video_refs (estado_uso);

-- Único: el backfill hace upsert con on_conflict=ficha_slug.
CREATE UNIQUE INDEX IF NOT EXISTS video_refs_ficha_slug_idx ON public.video_refs (ficha_slug);

ALTER TABLE public.video_refs ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (mismo criterio que `news_scripts`).
-- Escritura: solo service_role (el motor y las rutas del servidor), que ignora
-- RLS — por eso no hace falta política de INSERT/UPDATE para `authenticated`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='video_refs'
                 AND policyname='video_refs_select_all') THEN
    CREATE POLICY video_refs_select_all ON public.video_refs
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
