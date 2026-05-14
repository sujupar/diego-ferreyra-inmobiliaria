-- =============================================================================
-- Migration: Agregar portales Properati + Mudafy (Phase C-2)
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- Mudafy adquirió Properati en 2023. Ambos siguen operando con marca propia
-- pero comparten infra. Las agregamos como portales independientes para que
-- Diego pueda activarlas según convenga (puede tener plan en una y no en otra).
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Aplicar en Supabase Dashboard → SQL Editor → Run.
-- 2. Idempotente.
-- =============================================================================

-- 1. Seed de portal_credentials para los 2 portales nuevos
INSERT INTO public.portal_credentials (portal, enabled)
VALUES ('properati', false), ('mudafy', false)
ON CONFLICT (portal) DO NOTHING;

-- 2. Actualizar el trigger enqueue_property_listings para que incluya
-- properati y mudafy junto con los 3 originales.
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
      (NEW.id, 'zonaprop', 'pending'),
      (NEW.id, 'properati', 'pending'),
      (NEW.id, 'mudafy', 'pending')
    ON CONFLICT (property_id, portal) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe sobre properties, no hace falta recrearlo.

-- Verificación:
-- SELECT portal, enabled FROM portal_credentials ORDER BY portal;
-- (Esperado: 5 filas — argenprop, mercadolibre, mudafy, properati, zonaprop)
