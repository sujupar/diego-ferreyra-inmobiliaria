-- Radar de referencias de Instagram: columnas nuevas de video_refs, tablas radar_* y bucket.
-- Aditiva e idempotente (se puede re-correr). Escritura solo con service_role.

-- 1) Columnas nuevas de video_refs ------------------------------------------------------
ALTER TABLE public.video_refs
  ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'openclaw',
  ADD COLUMN IF NOT EXISTS ig_shortcode text,
  ADD COLUMN IF NOT EXISTS video_storage_path text,
  ADD COLUMN IF NOT EXISTS portada_storage_path text,
  ADD COLUMN IF NOT EXISTS formato text,
  ADD COLUMN IF NOT EXISTS comentarios_analisis text,
  ADD COLUMN IF NOT EXISTS transcripcion text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS tema_categoria text,
  ADD COLUMN IF NOT EXISTS puntaje smallint,
  ADD COLUMN IF NOT EXISTS oculta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_sirve_motivo text,
  ADD COLUMN IF NOT EXISTS no_sirve_at timestamptz,
  ADD COLUMN IF NOT EXISTS radar_run_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_refs_fuente_check') THEN
    ALTER TABLE public.video_refs ADD CONSTRAINT video_refs_fuente_check
      CHECK (fuente IN ('radar','openclaw'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_refs_categoria_check') THEN
    ALTER TABLE public.video_refs ADD CONSTRAINT video_refs_categoria_check
      CHECK (categoria IN ('inmobiliario_ar','inmobiliario_otro_pais','formato_otro_rubro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_refs_tema_categoria_check') THEN
    ALTER TABLE public.video_refs ADD CONSTRAINT video_refs_tema_categoria_check
      CHECK (tema_categoria IN ('noticias','impuestos','datos_mercado','creditos','gobierno_normativa','inmobiliarias','otro'));
  END IF;
END $$;

-- Un reel de Instagram = una sola fila (el radar hace upsert por ig_shortcode).
CREATE UNIQUE INDEX IF NOT EXISTS video_refs_ig_shortcode_idx
  ON public.video_refs (ig_shortcode) WHERE ig_shortcode IS NOT NULL;

-- Lo que cargaba OpenClaw queda archivado (oculto por defecto); no se borra ninguna fila.
UPDATE public.video_refs SET oculta = true WHERE fuente = 'openclaw';

-- 2) Tablas del radar -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_cuentas (
  usuario              text PRIMARY KEY,
  ig_user_id           text,
  origen               text CHECK (origen IN ('semilla','busqueda','explorar')),
  rubro                text CHECK (rubro IN ('inmobiliario','otro')),
  seguidores           bigint,
  base_vistas          bigint,
  base_n               int,
  base_medida_at       timestamptz,
  destacados           int NOT NULL DEFAULT 0,
  descartes_manuales   int NOT NULL DEFAULT 0,
  veces_revisada       int NOT NULL DEFAULT 0,
  ultima_revision_at   timestamptz,
  activa               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.radar_busquedas (
  termino  text PRIMARY KEY,
  activo   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.radar_vistos (
  ig_shortcode  text PRIMARY KEY,
  cuenta        text,
  multiplicador numeric,
  resultado     text CHECK (resultado IN ('publicado','descartado_relevancia','bajo_umbral','error')),
  motivo        text,
  run_id        uuid,
  visto_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.radar_corridas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio            timestamptz NOT NULL DEFAULT now(),
  fin               timestamptz,
  estado            text CHECK (estado IN ('corriendo','ok','parcial','frenada_por_instagram','error')),
  paso              text,
  cuentas_revisadas int NOT NULL DEFAULT 0,
  reels_mirados     int NOT NULL DEFAULT 0,
  candidatos        int NOT NULL DEFAULT 0,
  publicadas        int NOT NULL DEFAULT 0,
  mensaje           text,
  version           text,
  notificada_at     timestamptz
);

CREATE TABLE IF NOT EXISTS public.radar_config (
  clave  text PRIMARY KEY,
  valor  jsonb
);

-- 3) RLS: lectura para operaciones, escritura solo service_role (ignora RLS) -------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['radar_cuentas','radar_busquedas','radar_vistos','radar_corridas','radar_config'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
                   AND policyname = t || '_select_ops') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_operations_user())',
        t || '_select_ops', t);
    END IF;
  END LOOP;
END $$;

-- 4) Seeds ------------------------------------------------------------------------------
INSERT INTO public.radar_config (clave, valor) VALUES
  ('multiplicador_min', '3'::jsonb),
  ('dias_max',          '30'::jsonb),
  ('vistas_min',        '20000'::jsonb),
  ('reels_base',        '24'::jsonb),
  ('dias_maduro',       '3'::jsonb),
  ('puntaje_min',       '6'::jsonb),
  ('tope_diario',       '10'::jsonb),
  ('tope_cuentas',      '25'::jsonb),
  ('tope_reels',        '300'::jsonb)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.radar_busquedas (termino) VALUES
  ('crédito hipotecario'), ('créditos hipotecarios'), ('comprar departamento'),
  ('vender departamento'), ('alquileres'), ('ley de alquileres'), ('impuesto inmueble'),
  ('ganancias inmueble'), ('escritura'), ('escribano'), ('inmobiliaria'), ('martillero'),
  ('tasación'), ('dólar inmuebles'), ('propietarios'), ('mercado inmobiliario'),
  ('precio del metro cuadrado'), ('bienes raíces argentina')
ON CONFLICT (termino) DO NOTHING;

-- 5) Bucket privado de videos y portadas ------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-refs', 'video-refs', false, 52428800, ARRAY['video/mp4','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 52428800,
      allowed_mime_types = ARRAY['video/mp4','image/jpeg','image/webp'];
