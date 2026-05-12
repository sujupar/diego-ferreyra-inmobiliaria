-- =============================================================================
-- Migration: Re-encolar listings al editar/retirar/vender una propiedad
-- Date: 2026-05-12
--
-- COMPORTAMIENTO
-- --------------
-- - Si una propiedad ya publicada cambia campos relevantes (precio, título,
--   descripción, fotos, amenities, expensas), marca metadata.needs_update=true
--   en los listings published para que el worker los actualice en los portales.
-- - Si la propiedad pasa a 'sold' o 'withdrawn', marca needs_unpublish=true
--   para que el worker la baje de los portales.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Aplicar después de las dos migraciones anteriores.
-- 2. Pegar en Supabase Dashboard → SQL Editor → Run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.requeue_listings_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Cambio en campos relevantes → marca para update en portales
  IF NEW.status = 'approved'
     AND (
       OLD.asking_price IS DISTINCT FROM NEW.asking_price
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.photos IS DISTINCT FROM NEW.photos
       OR OLD.amenities IS DISTINCT FROM NEW.amenities
       OR OLD.expensas IS DISTINCT FROM NEW.expensas
       OR OLD.video_url IS DISTINCT FROM NEW.video_url
       OR OLD.tour_3d_url IS DISTINCT FROM NEW.tour_3d_url
     )
  THEN
    UPDATE public.property_listings
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_update}', 'true'::jsonb)
    WHERE property_id = NEW.id AND status = 'published';
  END IF;

  -- Propiedad vendida o retirada → marcar para unpublish
  IF NEW.status IN ('sold', 'withdrawn') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.property_listings
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_unpublish}', 'true'::jsonb)
    WHERE property_id = NEW.id AND status = 'published';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_requeue_listings_on_update ON public.properties;
CREATE TRIGGER trg_requeue_listings_on_update
  AFTER UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.requeue_listings_on_update();
