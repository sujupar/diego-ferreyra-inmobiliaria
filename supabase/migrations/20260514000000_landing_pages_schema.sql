-- =============================================================================
-- Migration: Schema para landings públicas de propiedades (Fase 2 M9)
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- Cada propiedad publicada en al menos un portal tendrá su propia landing
-- page en un subdominio: [slug].inmodf.com.ar. El slug se genera del address
-- + barrio + sufijo random, persistido en properties.public_slug (UNIQUE).
--
-- Los leads que llegan vía la landing se guardan en property_leads, con
-- assignment automático al asesor de la propiedad.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar el contenido de este archivo y ejecutar.
-- 3. Idempotente: re-ejecutar es seguro.
-- =============================================================================

-- 1. properties.public_slug
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_public_slug
  ON public.properties (public_slug)
  WHERE public_slug IS NOT NULL;

COMMENT ON COLUMN public.properties.public_slug IS
  'Slug único para landing pública en [slug].inmodf.com.ar';

-- 2. property_leads: leads que llegan desde landing/Meta/portales
CREATE TABLE IF NOT EXISTS public.property_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  message text,
  source text NOT NULL DEFAULT 'landing',
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  meta_lead_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_leads_property
  ON public.property_leads (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_leads_assigned
  ON public.property_leads (assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_leads_status
  ON public.property_leads (status, created_at DESC);

COMMENT ON COLUMN public.property_leads.status IS
  'new | contacted | scheduled | discarded';
COMMENT ON COLUMN public.property_leads.source IS
  'landing | meta_form | portal_mercadolibre | portal_argenprop | portal_zonaprop';

-- 3. updated_at trigger (reusa touch_updated_at de migración anterior)
DROP TRIGGER IF EXISTS trg_touch_property_leads ON public.property_leads;
CREATE TRIGGER trg_touch_property_leads
  BEFORE UPDATE ON public.property_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. RLS
ALTER TABLE public.property_leads ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/dueno/coordinador todo; asesor solo sus propiedades; abogado denegado
DROP POLICY IF EXISTS leads_select ON public.property_leads;
CREATE POLICY leads_select ON public.property_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND (
            assigned_to = p.id
            OR EXISTS (
              SELECT 1 FROM public.properties pr
              WHERE pr.id = property_leads.property_id AND pr.assigned_to = p.id
            )
          ))
        )
    )
  );

-- UPDATE: mismo patrón (cambiar status, agregar notas)
DROP POLICY IF EXISTS leads_update ON public.property_leads;
CREATE POLICY leads_update ON public.property_leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND (
            assigned_to = p.id
            OR EXISTS (
              SELECT 1 FROM public.properties pr
              WHERE pr.id = property_leads.property_id AND pr.assigned_to = p.id
            )
          ))
        )
    )
  );

-- INSERT/DELETE solo service_role (la landing usa server action con admin client).
-- No policy = deny para authenticated.

-- Verificación post-migration (opcional):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'properties' AND column_name = 'public_slug';
-- SELECT count(*) FROM property_leads; -- 0 al inicio
