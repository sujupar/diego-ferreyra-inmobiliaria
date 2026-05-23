-- =============================================================================
-- Cache de imágenes generadas para anuncios Meta Ads
-- =============================================================================
-- Generamos imágenes premium con Gemini 2.5 Flash Image. Cada generación
-- cuesta ~$0.04 y tarda ~10s. Si el asesor reintenta lanzar la campaña
-- (porque cambió el budget, o el preset, o por un error temporal), no
-- queremos regenerar las imágenes — las cacheamos por property + highlight
-- + format y reusamos.
--
-- También cacheamos el meta_image_hash devuelto por /adimages, así si la
-- campaña falla post-upload (ej. AdSet rechazado), el re-intento usa el
-- mismo hash sin re-subir bytes a Meta.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.property_ad_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  highlight_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('feed_square', 'feed_vertical', 'story_vertical')),
  prompt_hash text NOT NULL,
  storage_path text,                -- ruta en Supabase Storage (futuro)
  meta_image_hash text,             -- hash devuelto por Meta /adimages
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, highlight_id, format)
);

CREATE INDEX IF NOT EXISTS idx_property_ad_assets_property
  ON public.property_ad_assets (property_id);

-- updated_at autoset
DROP TRIGGER IF EXISTS trg_touch_property_ad_assets ON public.property_ad_assets;
CREATE TRIGGER trg_touch_property_ad_assets
  BEFORE UPDATE ON public.property_ad_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.property_ad_assets ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/dueno/coordinador todo; asesor solo sus propiedades; abogado denegado.
DROP POLICY IF EXISTS ad_assets_select ON public.property_ad_assets;
CREATE POLICY ad_assets_select ON public.property_ad_assets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_ad_assets.property_id AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- INSERT/UPDATE/DELETE solo service_role (el builder escribe).
-- No policy = deny para authenticated.

-- Verificación post-migration:
--   SELECT property_id, highlight_id, format, meta_image_hash, created_at
--   FROM public.property_ad_assets ORDER BY created_at DESC LIMIT 10;
