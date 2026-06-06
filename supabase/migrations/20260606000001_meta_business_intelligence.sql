-- =============================================================================
-- Meta Ads Business Intelligence — schema para wizard de 11 etapas
-- =============================================================================
--
-- Nuevo flow: el wizard se convierte en proceso asíncrono multi-etapa con
-- generación de 27 piezas gráficas (3 fotos × 3 piezas × 3 formatos), 3
-- avatares de comprador, custom audiences automáticos y conexión con la
-- descripción de portal como insumo.
--
-- Este SQL crea:
--  1. `meta_launch_jobs`: estado del proceso multi-etapa. Permite que el
--     frontend haga polling sin perder el estado si refresca la página.
--  2. `property_meta_audiences`: custom audiences creadas (visitantes,
--     converters, lookalike) por campaña.
--  3. Ampliación de `property_ad_assets` con storage_url, dimensiones, etc.
--
-- =============================================================================

-- 1. Jobs de lanzamiento (proceso multi-etapa)
CREATE TABLE IF NOT EXISTS public.meta_launch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Estado y progreso
  status text NOT NULL DEFAULT 'analyzing'
    CHECK (status IN (
      'analyzing',         -- Etapas 1-4: confirmando datos, recuperando desc., análisis Gemini, avatares
      'awaiting_user_input', -- Esperando selección de fotos, geo, presupuesto, etc.
      'generating',        -- Etapa 7: generando las 27 piezas
      'awaiting_confirm',  -- Asesor revisa y confirma
      'publishing',        -- Etapa 11: creando campaña en Meta + audiences
      'published',         -- ✓
      'failed',
      'cancelled'
    )),
  current_step text,         -- 'analyzing_photos' | 'generating_piece_3_of_27' | etc.
  progress_percent int DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),

  -- Inputs del asesor en cada etapa
  confirmed_property_fields jsonb,   -- snapshot de los campos confirmados
  description_used text,             -- descripción de portal o generada
  detected_strengths jsonb,          -- output del análisis Gemini
  detected_weaknesses jsonb,
  generated_avatars jsonb,           -- los 3 avatares propuestos
  selected_avatar_id text,           -- avatar elegido (0/1/2)
  avatar_comment text,               -- comentario que optimiza el avatar
  optimized_avatar jsonb,            -- avatar tras integrar el comentario
  starred_photo_indices int[],       -- índices de las 3 fotos con estrella
  geo_preset_id text,                -- 'cercanos' | 'similares' | 'amplio'
  daily_budget_ars int,
  videos_to_include text[],          -- URLs de videos opcionales

  -- Outputs
  result_campaign_id text,
  result_audience_ids text[],
  error_message text,

  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_launch_jobs_property ON public.meta_launch_jobs(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_launch_jobs_status ON public.meta_launch_jobs(status) WHERE status IN ('analyzing', 'generating', 'awaiting_user_input', 'awaiting_confirm', 'publishing');

-- Lock atómico: solo UN job activo por property a la vez (similar al lock de campaign).
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_launch_jobs_one_active
  ON public.meta_launch_jobs(property_id)
  WHERE status IN ('analyzing', 'awaiting_user_input', 'generating', 'awaiting_confirm', 'publishing');

-- updated_at autoset
DROP TRIGGER IF EXISTS trg_touch_meta_launch_jobs ON public.meta_launch_jobs;
CREATE TRIGGER trg_touch_meta_launch_jobs
  BEFORE UPDATE ON public.meta_launch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.meta_launch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS launch_jobs_select ON public.meta_launch_jobs;
CREATE POLICY launch_jobs_select ON public.meta_launch_jobs FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'dueno', 'coordinador')
        OR (p.role = 'asesor' AND EXISTS (
          SELECT 1 FROM public.properties pr WHERE pr.id = meta_launch_jobs.property_id AND pr.assigned_to = p.id
        ))
      )
  )
);

-- INSERT/UPDATE/DELETE solo service_role (backend)

-- 2. Custom Audiences por campaña/propiedad
CREATE TABLE IF NOT EXISTS public.property_meta_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  campaign_id text,                              -- nullable: lookalikes pueden vivir más allá de una campaña
  audience_id text NOT NULL,                     -- ID Meta del audience
  audience_type text NOT NULL
    CHECK (audience_type IN ('landing_visitors', 'landing_converters', 'lookalike_visitors', 'lookalike_converters')),
  audience_name text,
  audience_size_estimate int,
  rule_definition jsonb,                         -- regla que define el audience (URL pattern, event filters, etc.)
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  archived_at timestamptz,
  UNIQUE(property_id, audience_type, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_property_meta_audiences_prop ON public.property_meta_audiences(property_id);
CREATE INDEX IF NOT EXISTS idx_property_meta_audiences_campaign ON public.property_meta_audiences(campaign_id);

ALTER TABLE public.property_meta_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_audiences_select ON public.property_meta_audiences;
CREATE POLICY meta_audiences_select ON public.property_meta_audiences FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'dueno', 'coordinador')
        OR (p.role = 'asesor' AND EXISTS (
          SELECT 1 FROM public.properties pr WHERE pr.id = property_meta_audiences.property_id AND pr.assigned_to = p.id
        ))
      )
  )
);

-- 3. Ampliación de property_ad_assets con storage real + metadata
-- (la tabla existe desde 20260523000001_ad_assets.sql)
ALTER TABLE public.property_ad_assets
  ADD COLUMN IF NOT EXISTS storage_url text,            -- URL pública del bucket
  ADD COLUMN IF NOT EXISTS photo_source_index int,      -- índice de la foto original que se usó
  ADD COLUMN IF NOT EXISTS composition_variant int,     -- 1, 2 o 3 (cuál pieza de las 3 por foto)
  ADD COLUMN IF NOT EXISTS launch_job_id uuid REFERENCES public.meta_launch_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_property_ad_assets_job ON public.property_ad_assets(launch_job_id);

-- Verificación post-migration:
--   SELECT COUNT(*) FROM meta_launch_jobs;
--   SELECT COUNT(*) FROM property_meta_audiences;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='property_ad_assets'
--     ORDER BY ordinal_position;
