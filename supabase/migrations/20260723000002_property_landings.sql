-- =============================================================================
-- E1.1 — Landing pages editables + avatares con mapa de empatía
-- =============================================================================
-- Parte del plan docs/superpowers/plans/2026-07-23-landing-y-campana-v3.
--
-- Crea 3 tablas nuevas. NO toca `properties` (solo la referencia por FK).
-- IDEMPOTENTE. Correr en el Dashboard SQL Editor (Supabase CLI no conecta).
--
-- Reglas de oro que gobiernan el diseño:
--   1. properties.public_slug = única fuente del enlace. El diseño (template +
--      content) vive acá y puede cambiar N veces sin tocar el slug.
--   2. El contenido es DATO (content jsonb de bloques), no código.
--   3. content guarda ÍNDICES/referencias a properties.photos/video_file_url/
--      tour_3d_url, resueltos en render (nunca stale, sin inyección).
--   4. RLS por rol (patrón 20260505000001): operations RW, asesor su propiedad,
--      abogado sin acceso. La lectura pública de /p/[slug] va por service role.
--
-- Reusa public.touch_updated_at() (ya existe en el repo) y los helpers de rol
-- public.is_operations_user() / public.is_lawyer() de 20260505000001.
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1. property_avatars — avatar canónico, compartido landing <-> campaña
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_avatars (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  parent_avatar_id uuid REFERENCES public.property_avatars(id) ON DELETE SET NULL,
  source           text NOT NULL DEFAULT 'landing'
                     CHECK (source IN ('landing','campaign','system','manual')),
  label            text,
  avatar           jsonb NOT NULL,          -- EmpathyAvatar (says/thinks/feels/does + pains/gains + hooks + compat BuyerAvatar)
  is_primary       boolean NOT NULL DEFAULT false,
  model_used       text,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_avatars_property ON public.property_avatars(property_id);
-- Un solo avatar primary por propiedad (mismo patrón parcial que public_slug):
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_avatars_one_primary
  ON public.property_avatars(property_id) WHERE is_primary;

-- -------------------------------------------------------------------------
-- 2. property_landings — 1:1 con la propiedad + estado de co-creación
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_landings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  -- El gate de Fase 2 (campaña) exige status='published'. Las micro-etapas de
  -- co-creación NO van acá (anti-patrón 'pending' del worker): viven en wizard_state.
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','published','archived')),
  template_id    text NOT NULL DEFAULT 'editorial-directo',
  -- LandingDocument completo (bloques + theme). La VERDAD del diseño. Validado con Zod en la app.
  content        jsonb NOT NULL DEFAULT '{"version":1,"blocks":[],"theme":{}}'::jsonb,
  avatar_id      uuid REFERENCES public.property_avatars(id) ON DELETE SET NULL,
  -- Estado del wizard de co-creación (resume = leer este row).
  wizard_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Observabilidad IA (strengths/weaknesses de Vision + descripción de portal usada).
  ai_analysis    jsonb,
  -- Congelado al crear. Deriva del precio (>= USD 400k => alto_valor).
  funnel_type    text CHECK (funnel_type IN ('venta_propiedad','alto_valor')),
  -- Base UTM materializada al publicar (leída por meta-campaign-builder). Congelada.
  utm_base       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Espejo denormalizado del slug (la fuente sigue siendo properties.public_slug).
  public_slug    text,
  published_at   timestamptz,
  published_slug text,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_landings_status ON public.property_landings(status);

-- -------------------------------------------------------------------------
-- 3. property_landing_revisions — snapshots append-only (undo / cambio de template)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_landing_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id  uuid NOT NULL REFERENCES public.property_landings(id) ON DELETE CASCADE,
  revision    int  NOT NULL,
  template_id text NOT NULL,
  content     jsonb NOT NULL,
  avatar_id   uuid,
  reason      text,   -- 'template_switch' | 'manual_edit' | 'publish' | 'autosave'
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (landing_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_landing_revisions_landing ON public.property_landing_revisions(landing_id);

-- -------------------------------------------------------------------------
-- 4. Triggers updated_at (reusa public.touch_updated_at() del repo)
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_property_avatars_touch ON public.property_avatars;
CREATE TRIGGER trg_property_avatars_touch BEFORE UPDATE ON public.property_avatars
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_property_landings_touch ON public.property_landings;
CREATE TRIGGER trg_property_landings_touch BEFORE UPDATE ON public.property_landings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -------------------------------------------------------------------------
-- 5. RLS por rol. operations (admin/dueno/coordinador) RW; asesor su propiedad;
--    abogado SIN acceso (default-deny, no le damos policy). Service role bypasea
--    RLS => la landing pública /p/[slug] se sigue leyendo con admin client.
-- -------------------------------------------------------------------------
ALTER TABLE public.property_avatars           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_landings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_landing_revisions ENABLE ROW LEVEL SECURITY;

-- property_landings
DROP POLICY IF EXISTS landings_ops_all ON public.property_landings;
CREATE POLICY landings_ops_all ON public.property_landings
  FOR ALL TO authenticated
  USING (public.is_operations_user())
  WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS landings_asesor_own ON public.property_landings;
CREATE POLICY landings_asesor_own ON public.property_landings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid()));

-- property_avatars (mismo scope por property_id)
DROP POLICY IF EXISTS avatars_ops_all ON public.property_avatars;
CREATE POLICY avatars_ops_all ON public.property_avatars
  FOR ALL TO authenticated
  USING (public.is_operations_user())
  WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS avatars_asesor_own ON public.property_avatars;
CREATE POLICY avatars_asesor_own ON public.property_avatars
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid()));

-- property_landing_revisions (scope vía landing -> property)
DROP POLICY IF EXISTS revisions_ops_all ON public.property_landing_revisions;
CREATE POLICY revisions_ops_all ON public.property_landing_revisions
  FOR ALL TO authenticated
  USING (public.is_operations_user())
  WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS revisions_asesor_own ON public.property_landing_revisions;
CREATE POLICY revisions_asesor_own ON public.property_landing_revisions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.property_landings l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.id = landing_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.property_landings l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.id = landing_id AND p.assigned_to = auth.uid()));

-- =============================================================================
-- VERIFICACIÓN (correr en un segundo SQL si querés):
--   SELECT tablename, rowsecurity FROM pg_tables
--     WHERE tablename IN ('property_avatars','property_landings','property_landing_revisions');
--   -- Debe dar rowsecurity = true en las 3.
--   -- El índice parcial de is_primary no debe permitir 2 primarios por propiedad.
-- =============================================================================
