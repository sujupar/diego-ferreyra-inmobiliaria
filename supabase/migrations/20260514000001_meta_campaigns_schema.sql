-- =============================================================================
-- Migration: Schema para campañas Meta Ads por propiedad (Fase 2 M14)
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- Cuando una propiedad termina de publicarse en al menos un portal y tiene
-- public_slug asignado, el worker provisiona automáticamente:
--   1. Una campaña Meta Ads dirigida a la landing /p/[slug]
--   2. Budget calculado por tier de precio
--   3. Targeting geo alrededor de lat/lng + intereses real estate
--   4. Creatives generados desde fotos y datos de la propiedad
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Aplicar después de la migration 20260514000000.
-- 2. Pegar en Supabase Dashboard → SQL Editor → Run.
-- 3. Idempotente.
-- =============================================================================

-- 1. property_meta_campaigns: una fila por (property, campaign) en Meta
CREATE TABLE IF NOT EXISTS public.property_meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  adset_id text,
  ad_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'pending',
  budget_daily numeric,
  budget_currency text DEFAULT 'ARS',
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  copy jsonb NOT NULL DEFAULT '{}'::jsonb,
  landing_url text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  paused_at timestamptz,
  last_error text,
  attempts int NOT NULL DEFAULT 0,
  UNIQUE (campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_property
  ON public.property_meta_campaigns (property_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_status
  ON public.property_meta_campaigns (status);

COMMENT ON COLUMN public.property_meta_campaigns.status IS
  'pending | provisioning | active | paused | failed | archived';

-- 2. property_meta_metrics_daily: métricas Meta por día y propiedad
CREATE TABLE IF NOT EXISTS public.property_meta_metrics_daily (
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  date date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  ctr numeric,
  spend numeric NOT NULL DEFAULT 0,
  leads int NOT NULL DEFAULT 0,
  cost_per_lead numeric,
  reach int NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (property_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_metrics_property_date
  ON public.property_meta_metrics_daily (property_id, date DESC);

-- 3. meta_provision_jobs: cola de jobs para crear/pausar/reactivar campañas
-- Patrón análogo a property_listings, separado para no mezclar dominios.
CREATE TABLE IF NOT EXISTS public.meta_provision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT NOW(),
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Partial unique: solo un job pending/in_progress por (property, action)
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_jobs_active
  ON public.meta_provision_jobs (property_id, action)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_meta_jobs_status_next
  ON public.meta_provision_jobs (status, next_attempt_at)
  WHERE status = 'pending';

COMMENT ON COLUMN public.meta_provision_jobs.action IS
  'create_campaign | pause_campaign | activate_campaign | archive_campaign';
COMMENT ON COLUMN public.meta_provision_jobs.status IS
  'pending | in_progress | done | failed';

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS trg_touch_meta_campaigns ON public.property_meta_campaigns;
CREATE TRIGGER trg_touch_meta_campaigns
  BEFORE UPDATE ON public.property_meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_meta_jobs ON public.meta_provision_jobs;
CREATE TRIGGER trg_touch_meta_jobs
  BEFORE UPDATE ON public.meta_provision_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Trigger SQL: cuando una propiedad gana su primer listing 'published',
-- encolar create_campaign si todavía no tiene campaign activa.
CREATE OR REPLACE FUNCTION public.enqueue_meta_campaign_on_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo cuando un listing pasa a 'published' por primera vez
  IF NEW.status = 'published'
     AND (OLD.status IS DISTINCT FROM 'published')
  THEN
    -- Verificar si esta property ya tiene campaign activa o en cola
    IF NOT EXISTS (
      SELECT 1 FROM public.property_meta_campaigns
      WHERE property_id = NEW.property_id
        AND status IN ('pending', 'provisioning', 'active', 'paused')
    ) AND NOT EXISTS (
      SELECT 1 FROM public.meta_provision_jobs
      WHERE property_id = NEW.property_id
        AND action = 'create_campaign'
        AND status IN ('pending', 'in_progress')
    ) THEN
      BEGIN
        INSERT INTO public.meta_provision_jobs (property_id, action)
        VALUES (NEW.property_id, 'create_campaign');
      EXCEPTION WHEN unique_violation THEN
        -- Otro proceso encoló el mismo job (race); no hacemos nada.
        NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_meta_campaign ON public.property_listings;
CREATE TRIGGER trg_enqueue_meta_campaign
  AFTER UPDATE ON public.property_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_campaign_on_publish();

-- 6. Trigger SQL: cuando properties.status pasa a 'sold' o 'withdrawn',
-- pausar (no archivar) la campaign Meta para no perder histórico.
CREATE OR REPLACE FUNCTION public.enqueue_meta_pause_on_sold()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('sold', 'withdrawn')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    -- Solo si tiene campaña activa
    IF EXISTS (
      SELECT 1 FROM public.property_meta_campaigns
      WHERE property_id = NEW.id AND status = 'active'
    ) THEN
      BEGIN
        INSERT INTO public.meta_provision_jobs (property_id, action)
        VALUES (NEW.id, 'pause_campaign');
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_meta_pause ON public.properties;
CREATE TRIGGER trg_enqueue_meta_pause
  AFTER UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_pause_on_sold();

-- 7. RLS
ALTER TABLE public.property_meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_meta_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_provision_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT campaigns: admin/dueno/coordinador todo; asesor solo sus propiedades
DROP POLICY IF EXISTS meta_campaigns_select ON public.property_meta_campaigns;
CREATE POLICY meta_campaigns_select ON public.property_meta_campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_meta_campaigns.property_id AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- SELECT metrics: mismo patrón
DROP POLICY IF EXISTS meta_metrics_select ON public.property_meta_metrics_daily;
CREATE POLICY meta_metrics_select ON public.property_meta_metrics_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_meta_metrics_daily.property_id AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- meta_provision_jobs: solo admin/dueno (es operacional, no para asesores)
DROP POLICY IF EXISTS meta_jobs_select ON public.meta_provision_jobs;
CREATE POLICY meta_jobs_select ON public.meta_provision_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'dueno')
    )
  );

-- INSERT/UPDATE/DELETE solo service_role en las 3 tablas.
