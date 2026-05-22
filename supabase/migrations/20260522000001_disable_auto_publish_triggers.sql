-- =============================================================================
-- Desactivar publicación automática en portales y Meta Ads.
-- =============================================================================
-- A partir de ahora, las publicaciones en MercadoLibre y la creación de
-- campañas en Meta Ads NO son automáticas al pasar la propiedad a "approved".
-- El asesor debe disparar ambas acciones manualmente desde el wizard:
--   /properties/[id]/marketing/mercadolibre  → wizard ML con preview + edit
--   /properties/[id]/marketing/meta-ads      → wizard inteligente Meta
--
-- Las funciones de trigger se MANTIENEN (por si en el futuro querés volver
-- a habilitar auto-mode para algún tipo específico de propiedad). Solo se
-- eliminan los triggers que las invocan.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_enqueue_property_listings ON public.properties;
DROP TRIGGER IF EXISTS trg_enqueue_meta_capture ON public.properties;

COMMENT ON FUNCTION public.enqueue_property_listings() IS
  'DESACTIVADA 2026-05-22 — la publicación es manual desde el wizard en /properties/[id]/marketing/mercadolibre. Re-activar con: CREATE TRIGGER trg_enqueue_property_listings AFTER INSERT OR UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION enqueue_property_listings();';

-- Solo agregamos comment si la función Meta existe (puede que esté en otra migración)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enqueue_meta_campaign_on_capture') THEN
    EXECUTE 'COMMENT ON FUNCTION public.enqueue_meta_campaign_on_capture() IS ''DESACTIVADA 2026-05-22 — las campañas Meta se crean manualmente desde el wizard en /properties/[id]/marketing/meta-ads.''';
  END IF;
END $$;

-- Verificación post-migration:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'properties'::regclass AND NOT tgisinternal;
-- Debe NO aparecer:
--   trg_enqueue_property_listings
--   trg_enqueue_meta_capture
