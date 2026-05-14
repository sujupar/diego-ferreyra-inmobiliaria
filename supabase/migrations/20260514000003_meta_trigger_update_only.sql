-- =============================================================================
-- Migration: Restringir trigger Meta a UPDATE solamente (M14 hardening)
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- El trigger AFTER INSERT OR UPDATE en properties también dispara en INSERT.
-- En un INSERT, OLD es NULL, por lo que la condición
-- "OLD.status IS DISTINCT FROM NEW.status" es siempre TRUE. Esto significa
-- que un import masivo de propiedades ya aprobadas (seed, backfill) encolaría
-- jobs Meta inmediatamente — comportamiento no deseado.
--
-- Fix: recreamos el trigger solo para UPDATE. Las propiedades nuevas se
-- captan vía el flujo normal (draft → pending → approved) que pasa por
-- UPDATE.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_enqueue_meta_capture ON public.properties;
CREATE TRIGGER trg_enqueue_meta_capture
  AFTER UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_campaign_on_capture();
