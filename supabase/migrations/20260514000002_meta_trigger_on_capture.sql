-- =============================================================================
-- Migration: Desacoplar trigger Meta del estado de portales (M14 fix)
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- El trigger original disparaba create_campaign cuando un listing pasaba a
-- 'published' en algún portal. Esto era una dependencia incorrecta: la
-- campaña Meta debe poder lanzarse en cuanto la propiedad esté captada
-- (status='approved' + legal_status='approved' + fotos + lat/lng), sin
-- importar si los portales ya respondieron.
--
-- Esta migration:
--   1. Drop del trigger viejo sobre property_listings
--   2. Crea uno nuevo sobre properties con la misma condición de captación
--      que enqueue_property_listings.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Aplicar después de 20260514000001.
-- 2. Pegar en Supabase Dashboard → SQL Editor → Run.
-- 3. Idempotente.
-- =============================================================================

-- 1. Drop trigger viejo (sobre property_listings)
DROP TRIGGER IF EXISTS trg_enqueue_meta_campaign ON public.property_listings;
DROP FUNCTION IF EXISTS public.enqueue_meta_campaign_on_publish();

-- 2. Nuevo trigger sobre properties: dispara al captarse
CREATE OR REPLACE FUNCTION public.enqueue_meta_campaign_on_capture()
RETURNS TRIGGER AS $$
BEGIN
  -- Mismo criterio de captación que enqueue_property_listings + requiere
  -- lat/lng (Meta no puede targeting sin geo). Slug se asigna en el worker
  -- on-demand (no lo requerimos acá).
  IF NEW.status = 'approved'
     AND NEW.legal_status = 'approved'
     AND COALESCE(array_length(NEW.photos, 1), 0) >= 1
     AND NEW.latitude IS NOT NULL
     AND NEW.longitude IS NOT NULL
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR OLD.legal_status IS DISTINCT FROM NEW.legal_status
       OR OLD.photos IS DISTINCT FROM NEW.photos
       OR OLD.latitude IS DISTINCT FROM NEW.latitude
       OR OLD.longitude IS DISTINCT FROM NEW.longitude
     )
  THEN
    -- Verificar que no tenga ya campaign activa/en cola
    IF NOT EXISTS (
      SELECT 1 FROM public.property_meta_campaigns
      WHERE property_id = NEW.id
        AND status IN ('pending', 'provisioning', 'active', 'paused')
    ) AND NOT EXISTS (
      SELECT 1 FROM public.meta_provision_jobs
      WHERE property_id = NEW.id
        AND action = 'create_campaign'
        AND status IN ('pending', 'in_progress')
    ) THEN
      BEGIN
        INSERT INTO public.meta_provision_jobs (property_id, action)
        VALUES (NEW.id, 'create_campaign');
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_meta_capture ON public.properties;
CREATE TRIGGER trg_enqueue_meta_capture
  AFTER INSERT OR UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_campaign_on_capture();

-- Verificación post-migration:
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_enqueue_meta%';
-- Esperado: solo trg_enqueue_meta_capture (no trg_enqueue_meta_campaign).
