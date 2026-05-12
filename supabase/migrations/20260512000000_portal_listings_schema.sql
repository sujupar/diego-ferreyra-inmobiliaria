-- =============================================================================
-- Migration: Schema para publicación automática en portales
-- Date: 2026-05-12
--
-- CONTEXTO
-- --------
-- Extiende properties con campos requeridos por los portales (lat/lng, video,
-- tour 3D, expensas, amenities, operation_type, title, postal_code) y crea
-- las tablas de soporte para el sistema de publicación:
--   - property_listings: una fila por (propiedad, portal) con estado, retries
--   - property_metrics_daily: métricas diarias por (propiedad, portal)
--   - portal_credentials: credenciales encriptadas por portal (enabled flag)
--   - property_publish_events: audit log
--
-- También define el trigger que encola publicaciones al captarse la propiedad
-- (status='approved' AND legal_status='approved' AND photos.length >= 1).
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar el contenido de este archivo y ejecutar.
-- 3. Verificar:
--      SELECT portal, enabled FROM portal_credentials;
--      (esperado: 3 filas con enabled=false)
-- 4. Idempotente: re-ejecutar es seguro.
-- =============================================================================

-- 1. Extender properties con campos para portales
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS tour_3d_url text,
  ADD COLUMN IF NOT EXISTS expensas numeric,
  ADD COLUMN IF NOT EXISTS amenities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operation_type text DEFAULT 'venta',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS postal_code text;

COMMENT ON COLUMN public.properties.latitude IS 'Lat decimal para portales (ZonaProp/ML requieren geolocalización)';
COMMENT ON COLUMN public.properties.longitude IS 'Lng decimal para portales';
COMMENT ON COLUMN public.properties.amenities IS 'Array de strings: pileta, parrilla, sum, gym, seguridad, etc.';
COMMENT ON COLUMN public.properties.operation_type IS 'venta | alquiler | temporario';
COMMENT ON COLUMN public.properties.title IS 'Título comercial; fallback al address';

-- 2. property_listings: una fila por (propiedad, portal)
CREATE TABLE IF NOT EXISTS public.property_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_id text,
  external_url text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT NOW(),
  last_published_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, portal)
);

CREATE INDEX IF NOT EXISTS idx_property_listings_status_next
  ON public.property_listings (status, next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_property_listings_property
  ON public.property_listings (property_id);

COMMENT ON COLUMN public.property_listings.status IS
  'pending | publishing | published | failed | disabled | paused';

-- 3. property_metrics_daily: una fila por (propiedad, portal, día)
CREATE TABLE IF NOT EXISTS public.property_metrics_daily (
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  date date NOT NULL,
  views int NOT NULL DEFAULT 0,
  contacts int NOT NULL DEFAULT 0,
  favorites int NOT NULL DEFAULT 0,
  whatsapps int NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (property_id, portal, date)
);

CREATE INDEX IF NOT EXISTS idx_property_metrics_property_date
  ON public.property_metrics_daily (property_id, date DESC);

-- 4. portal_credentials: una fila por portal con enabled flag
CREATE TABLE IF NOT EXISTS public.portal_credentials (
  portal text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Seed con 3 portales en disabled (idempotente)
INSERT INTO public.portal_credentials (portal, enabled)
VALUES ('mercadolibre', false), ('argenprop', false), ('zonaprop', false)
ON CONFLICT (portal) DO NOTHING;

-- 5. property_publish_events: audit log
CREATE TABLE IF NOT EXISTS public.property_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.property_listings(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  error_message text,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_events_property
  ON public.property_publish_events (property_id, created_at DESC);

-- 6. Trigger SQL: al captarse una propiedad, encolar publicaciones
CREATE OR REPLACE FUNCTION public.enqueue_property_listings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved'
     AND NEW.legal_status = 'approved'
     AND COALESCE(array_length(NEW.photos, 1), 0) >= 1
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.legal_status IS DISTINCT FROM NEW.legal_status
          OR OLD.photos IS DISTINCT FROM NEW.photos)
  THEN
    INSERT INTO public.property_listings (property_id, portal, status)
    VALUES
      (NEW.id, 'mercadolibre', 'pending'),
      (NEW.id, 'argenprop', 'pending'),
      (NEW.id, 'zonaprop', 'pending')
    ON CONFLICT (property_id, portal) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_property_listings ON public.properties;
CREATE TRIGGER trg_enqueue_property_listings
  AFTER INSERT OR UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_property_listings();

-- 7. updated_at autoset trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_property_listings ON public.property_listings;
CREATE TRIGGER trg_touch_property_listings
  BEFORE UPDATE ON public.property_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_portal_credentials ON public.portal_credentials;
CREATE TRIGGER trg_touch_portal_credentials
  BEFORE UPDATE ON public.portal_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Verificación post-migration (opcional):
-- SELECT portal, enabled FROM portal_credentials;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'properties' AND column_name IN (
--     'latitude','longitude','video_url','tour_3d_url','expensas',
--     'amenities','operation_type','title','postal_code'
--   );
