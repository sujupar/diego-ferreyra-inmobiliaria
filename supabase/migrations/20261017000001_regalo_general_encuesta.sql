-- Regalo GENERAL de la encuesta de visita (spec 2026-10-17-regalo-guia-compradores-design.md).
--
-- Un solo regalo para todas las visitas (hoy: la guía de gastos para compradores). Si existe,
-- MANDA sobre el regalo de la propiedad (lib/visitas/encuesta/regalo.ts → regaloQueAplica): los
-- mensajes v2 prometen la guía, y otro archivo haría mentir al mensaje.
--
-- Tabla de UNA fila (id boolean = true, como visit_survey_settings). Borrar la fila = sin regalo
-- general, y todo vuelve a funcionar exactamente como antes.
--
-- Los paths se validan con el MISMO regex que lib/visitas/encuesta/regalo.ts
-- (esPathDelRegaloGeneral / esPathDePortadaGeneral): se tocan juntos.

CREATE TABLE IF NOT EXISTS public.visit_survey_general_gift (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 160),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  cover_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT visit_survey_general_gift_file_path_check
    CHECK (file_path ~ '^general/regalo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'),
  CONSTRAINT visit_survey_general_gift_cover_path_check
    CHECK (cover_path IS NULL OR cover_path ~ '^general/portada-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
);

-- Lee y escribe el servidor con la service role. Desde el navegador, solo lectura para operaciones
-- (mismo criterio que visit_survey_settings); nadie escribe con su propia sesión.
ALTER TABLE public.visit_survey_general_gift ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visit_survey_general_gift FROM anon, authenticated;
GRANT SELECT ON public.visit_survey_general_gift TO authenticated;

DROP POLICY IF EXISTS visit_survey_general_gift_select_ops ON public.visit_survey_general_gift;
CREATE POLICY visit_survey_general_gift_select_ops ON public.visit_survey_general_gift
  FOR SELECT TO authenticated
  USING ((SELECT public.is_operations_user()));
