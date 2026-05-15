-- =============================================================================
-- Migration: Remover portales Properati + Mudafy
-- Date: 2026-05-14
--
-- Decisión: Diego no usa estos portales. Removemos seeds + revertimos
-- el trigger enqueue_property_listings al estado original con 3 portales.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Aplicar en Supabase Dashboard → SQL Editor → Run.
-- 2. Idempotente.
-- =============================================================================

-- 1. Borrar listings dormidos (status='pending' o 'disabled') de estos portales
DELETE FROM public.property_listings
WHERE portal IN ('properati', 'mudafy');

-- 2. Borrar métricas si por algún motivo hubiera (ninguna, pero por las dudas)
DELETE FROM public.property_metrics_daily
WHERE portal IN ('properati', 'mudafy');

-- 3. Borrar audit events de estos portales (limpieza histórica)
DELETE FROM public.property_publish_events
WHERE portal IN ('properati', 'mudafy');

-- 4. Borrar el seed de portal_credentials
DELETE FROM public.portal_credentials
WHERE portal IN ('properati', 'mudafy');

-- 5. Revertir el trigger enqueue_property_listings a 3 portales originales
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

-- Verificación post-migration:
-- SELECT portal, enabled FROM portal_credentials ORDER BY portal;
-- (Esperado: 3 filas — argenprop, mercadolibre, zonaprop)
