-- =============================================================================
-- Migration: Generador de Carruseles (sección "Redes Sociales") — Fase 1
-- Date: 2026-07-21
--
-- Crea social_carousels + social_carousel_slides + bucket privado
-- 'social-carousels'. RLS por rol reutilizando public.is_operations_user()
-- e public.is_lawyer() (creadas en 20260505000001). El abogado NO tiene acceso.
--
-- Aditiva e idempotente. Aplicar vía scripts/apply-social-carousels-migration-pg.ts
-- (session pooler) o pegar en el Dashboard SQL Editor del proyecto mncsnastmcjdjxrehdep.
-- =============================================================================

-- ---- Tablas ----
CREATE TABLE IF NOT EXISTS public.social_carousels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title          text,
  topic          text NOT NULL,
  structure      text NOT NULL DEFAULT 'auto'
                   CHECK (structure IN ('aversion', 'errores', 'momento', 'auto')),
  target_length  int,                                   -- NULL = auto
  cta_type       text NOT NULL DEFAULT 'campaign'
                   CHECK (cta_type IN ('campaign', 'organic')),
  diego_enabled  boolean NOT NULL DEFAULT true,
  status         text NOT NULL DEFAULT 'generating_script'
                   CHECK (status IN ('generating_script', 'generating_images', 'ready', 'failed')),
  progress_percent int DEFAULT 0,
  script         jsonb,
  caption        text,
  hashtags       text[],
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_carousel_slides (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_id        uuid NOT NULL REFERENCES public.social_carousels(id) ON DELETE CASCADE,
  position           int NOT NULL,
  role               text,        -- hook|build|reveal|proof|cta
  layout             text,        -- cinematic|split|infographic|testimonial
  accent             text,        -- red|green|white
  copy               jsonb,       -- {eyebrow,title,body,cta_label}
  image_kind         text,        -- concept|diego|testimonial|none
  image_prompt       text,
  storage_url        text,        -- PNG compuesto (path en el bucket)
  image_storage_url  text,        -- escena cruda (para re-render sin re-generar)
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'image_done', 'composed', 'failed')),
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS social_carousel_slides_pos_uq
  ON public.social_carousel_slides (carousel_id, position);
CREATE INDEX IF NOT EXISTS social_carousels_created_by_idx
  ON public.social_carousels (created_by);
CREATE INDEX IF NOT EXISTS social_carousels_status_idx
  ON public.social_carousels (status);

-- ---- RLS ----
ALTER TABLE public.social_carousels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_carousel_slides ENABLE ROW LEVEL SECURITY;

-- social_carousels: operaciones (admin/dueño/coord) + el creador. Abogado: sin policy = sin acceso.
DROP POLICY IF EXISTS social_carousels_select ON public.social_carousels;
CREATE POLICY social_carousels_select ON public.social_carousels
  FOR SELECT TO authenticated
  USING (public.is_operations_user() OR created_by = auth.uid());

DROP POLICY IF EXISTS social_carousels_insert ON public.social_carousels;
CREATE POLICY social_carousels_insert ON public.social_carousels
  FOR INSERT TO authenticated
  WITH CHECK ((public.is_operations_user() OR created_by = auth.uid()) AND NOT public.is_lawyer());

DROP POLICY IF EXISTS social_carousels_update ON public.social_carousels;
CREATE POLICY social_carousels_update ON public.social_carousels
  FOR UPDATE TO authenticated
  USING (public.is_operations_user() OR created_by = auth.uid())
  WITH CHECK (public.is_operations_user() OR created_by = auth.uid());

DROP POLICY IF EXISTS social_carousels_delete ON public.social_carousels;
CREATE POLICY social_carousels_delete ON public.social_carousels
  FOR DELETE TO authenticated
  USING (public.is_operations_user() OR created_by = auth.uid());

-- social_carousel_slides: acceso si el carrusel padre es accesible.
DROP POLICY IF EXISTS social_carousel_slides_all ON public.social_carousel_slides;
CREATE POLICY social_carousel_slides_all ON public.social_carousel_slides
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.social_carousels c
    WHERE c.id = carousel_id AND (public.is_operations_user() OR c.created_by = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.social_carousels c
    WHERE c.id = carousel_id AND (public.is_operations_user() OR c.created_by = auth.uid())
  ));

-- ---- Storage (bucket privado) ----
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-carousels', 'social-carousels', false)
ON CONFLICT (id) DO NOTHING;

-- Lectura para autenticados no-abogados (defensa en profundidad; la app sirve vía signed URL/service role).
DROP POLICY IF EXISTS social_carousels_storage_read ON storage.objects;
CREATE POLICY social_carousels_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'social-carousels' AND NOT public.is_lawyer());
