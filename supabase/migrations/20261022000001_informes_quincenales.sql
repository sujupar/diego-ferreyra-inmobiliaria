-- Informes quincenales por propiedad (spec 2026-10-22-informe-quincenal-design.md, plan tarea 1).
--
-- Un informe = una propiedad + un período [desde, hasta] (fechas de Argentina, ambos incluidos).
-- `fuentes`: lo que la plataforma juntó sola, por fuente, con su estado — una fuente caída queda
--   'error' y el informe lo dice; NUNCA se guarda un 0 inventado (criterio 10 del spec).
-- `manual`: lo que carga Paula (números de Zonaprop/Argenprop/TikTok/ML e información escrita).
-- `competidoras`: los avisos que compiten (link + datos que trae el scraper, editables).
-- `capturas`: paths de las capturas de pantalla en el bucket privado `property-reports`.
-- Escribe SOLO el servidor (service role): lectura por rol para el navegador.

CREATE TABLE IF NOT EXISTS public.property_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  desde DATE NOT NULL,
  hasta DATE NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('ciclo', 'manual')),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'listo')),
  fuentes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fuentes) = 'object'),
  manual JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(manual) = 'object'),
  competidoras JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(competidoras) = 'array' AND jsonb_array_length(competidoras) <= 8),
  capturas JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capturas) = 'object'),
  pdf_path TEXT CHECK (pdf_path IS NULL OR pdf_path ~ '^informes/[0-9a-f-]{36}/informe-[0-9a-f-]{36}\.pdf$'),
  listo_at TIMESTAMPTZ,
  listo_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_reports_periodo_check CHECK (hasta >= desde AND hasta - desde <= 120),
  -- El cron del ciclo y "Nuevo informe" pueden pedir el mismo período: un solo informe.
  CONSTRAINT property_reports_periodo_unico UNIQUE (property_id, desde, hasta),
  CONSTRAINT property_reports_listo_check CHECK (estado = 'borrador' OR (listo_at IS NOT NULL AND pdf_path IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_property_reports_property ON public.property_reports (property_id, hasta DESC);
CREATE INDEX IF NOT EXISTS idx_property_reports_estado ON public.property_reports (estado, hasta DESC);

ALTER TABLE public.property_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_reports FROM anon, authenticated;
GRANT SELECT ON public.property_reports TO authenticated;

-- Operaciones ve todo; el asesor, los de las propiedades que tiene asignadas o que captó.
-- El abogado no ve informes (is_operations_user es falso para él y no tiene propiedades asignadas).
DROP POLICY IF EXISTS property_reports_select_scoped ON public.property_reports;
CREATE POLICY property_reports_select_scoped ON public.property_reports
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_operations_user())
    OR EXISTS (
      SELECT 1 FROM public.properties p
       WHERE p.id = property_reports.property_id
         AND (p.assigned_to = (SELECT auth.uid()) OR p.created_by = (SELECT auth.uid()))
    )
  );

-- Bucket PRIVADO: capturas (png/jpg/webp) y el PDF final. Sin políticas en storage.objects:
-- solo el servidor firma subidas y descargas (patrón del regalo de la encuesta).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-reports', 'property-reports', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
