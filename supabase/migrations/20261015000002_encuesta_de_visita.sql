-- Sistema de visitas — Entrega 3: encuesta post-visita + regalo por propiedad.
-- Spec: docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md §11.5 (manda sobre §4.1).
-- Se aplica con scripts/apply-encuesta-visita-pg.ts ANTES del merge: el código nuevo escribe estas
-- tablas (sin ellas, "Se realizó" no crea la encuesta y la página pública da 500). Para el código
-- que hoy está en producción todo es aditivo: las dos tablas que se borran solo las usan rutas sin
-- consumidores (0 links emitidos).
-- Los catálogos con CHECK se comparan con lib/visitas/encuesta/tipos.ts en tipos.test.ts: cada
-- lista va en UNA línea y se tocan JUNTOS.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) El cuestionario de mayo: 0 filas medidas el 2026-10-10. Si alguien cargó algo, ABORTA.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.visit_questionnaires') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.visit_questionnaires) THEN
    RAISE EXCEPTION 'visit_questionnaires tiene filas: no se borra sin revisarlas';
  END IF;
  IF to_regclass('public.visit_questionnaire_tokens') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.visit_questionnaire_tokens) THEN
    RAISE EXCEPTION 'visit_questionnaire_tokens tiene filas: no se borra sin revisarlas';
  END IF;
END $$;
DROP TABLE IF EXISTS public.visit_questionnaire_tokens;
DROP TABLE IF EXISTS public.visit_questionnaires;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) La encuesta: UNA fila por visita (link + envío + respuestas + avisos).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL UNIQUE REFERENCES public.property_visits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{22}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_status TEXT NOT NULL DEFAULT 'sin_enviar' CHECK (send_status IN ('sin_enviar', 'enviada', 'fallida', 'omitida')),
  send_skip_reason TEXT CHECK (send_skip_reason IS NULL OR send_skip_reason IN ('envio_apagado', 'sin_regalo', 'telefono_invalido', 'plantilla_sin_configurar', 'plantilla_desconocida', 'ajustes_ilegibles', 'modo_prueba_whatsapp', 'ya_respondio', 'vencida', 'ya_enviada')),
  send_error TEXT CHECK (send_error IS NULL OR length(send_error) <= 500),
  sent_at TIMESTAMPTZ,
  sent_to TEXT,
  wa_message_id TEXT,
  opened_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  write_count INT NOT NULL DEFAULT 0 CHECK (write_count >= 0),
  last_step TEXT CHECK (last_step IS NULL OR last_step IN ('gusto', 'mas_gusto', 'menos_gusto', 'precio', 'oferta')),
  completed_at TIMESTAMPTZ,
  liked BOOLEAN,
  most_liked_tags TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(most_liked_tags) <= 8),
  most_liked_other TEXT CHECK (most_liked_other IS NULL OR length(most_liked_other) <= 280),
  least_liked_tags TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(least_liked_tags) <= 8),
  least_liked_other TEXT CHECK (least_liked_other IS NULL OR length(least_liked_other) <= 280),
  price_opinion TEXT CHECK (price_opinion IS NULL OR price_opinion IN ('correcto', 'alto', 'bajo')),
  offer_amount NUMERIC CHECK (offer_amount IS NULL OR offer_amount > 0),
  offer_currency TEXT CHECK (offer_currency IS NULL OR offer_currency IN ('USD', 'ARS')),
  offer_declined BOOLEAN,
  contact_phone TEXT CHECK (contact_phone IS NULL OR length(contact_phone) <= 20),
  contact_email TEXT CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  wants_similar BOOLEAN,
  team_notice_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (team_notice_status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde')),
  team_notice_at TIMESTAMPTZ,
  gift_whatsapp_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (gift_whatsapp_status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde')),
  gift_whatsapp_at TIMESTAMPTZ,
  gift_wa_message_id TEXT,
  gift_email_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (gift_email_status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde')),
  gift_email_at TIMESTAMPTZ,
  notice_attempts INT NOT NULL DEFAULT 0 CHECK (notice_attempts >= 0),
  notice_error TEXT CHECK (notice_error IS NULL OR length(notice_error) <= 500),
  gift_downloaded_at TIMESTAMPTZ
);

-- El barrido de avisos busca encuestas completas recientes; el estado de la ficha busca por mensaje.
CREATE INDEX IF NOT EXISTS idx_visit_surveys_completed_at
  ON public.visit_surveys (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_surveys_wa_message_id
  ON public.visit_surveys (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_surveys_created_by
  ON public.visit_surveys (created_by) WHERE created_by IS NOT NULL;

-- updated_at: el BEFORE solo toca NEW (regla de CLAUDE.md: nada de escribir otra tabla acá).
CREATE OR REPLACE FUNCTION public.visit_surveys_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_visit_surveys_touch ON public.visit_surveys;
CREATE TRIGGER trg_visit_surveys_touch BEFORE UPDATE ON public.visit_surveys
  FOR EACH ROW EXECUTE FUNCTION public.visit_surveys_touch();

COMMENT ON TABLE public.visit_surveys IS
  'Encuesta post-visita (spec §11). Una por visita. La escribe SOLO el servidor (clave de servicio).';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Ajustes: una sola fila. Todo APAGADO de fábrica salvo "solo con regalo".
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_survey_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  envio_automatico BOOLEAN NOT NULL DEFAULT false,
  solo_con_regalo BOOLEAN NOT NULL DEFAULT true,
  regalo_por_whatsapp BOOLEAN NOT NULL DEFAULT false,
  telefonos_prueba TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(telefonos_prueba) <= 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.visit_survey_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Regalo de la encuesta: UNO por propiedad. Paths atados a la propiedad por CHECK.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_survey_gifts (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 160),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  cover_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT property_survey_gifts_file_path_check
    CHECK (file_path ~ ('^properties/' || property_id::text || '/regalo-[0-9a-f-]{36}\.pdf$')),
  CONSTRAINT property_survey_gifts_cover_path_check
    CHECK (cover_path IS NULL OR cover_path ~ ('^properties/' || property_id::text || '/portada-[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
CREATE INDEX IF NOT EXISTS idx_property_survey_gifts_updated_by
  ON public.property_survey_gifts (updated_by) WHERE updated_by IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Bucket PRIVADO del regalo. Sin políticas en storage.objects: solo el servidor sube
--    (URL firmada de subida) y solo el servidor firma descargas.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('visit-survey-gifts', 'visit-survey-gifts', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Límite por link + "abierta", ATÓMICO (un read-modify-write desde JS no lo sería).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.visit_survey_registrar(p_token TEXT, p_tipo TEXT, p_max INT)
RETURNS BOOLEAN LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH u AS (
    UPDATE public.visit_surveys
       SET write_count = write_count + 1,
           opened_at = CASE WHEN p_tipo = 'abierta' THEN coalesce(opened_at, now()) ELSE opened_at END,
           open_count = open_count + CASE WHEN p_tipo = 'abierta' THEN 1 ELSE 0 END
     WHERE token = p_token AND write_count < p_max
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u)
$$;
REVOKE ALL ON FUNCTION public.visit_survey_registrar(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visit_survey_registrar(TEXT, TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_survey_registrar(TEXT, TEXT, INT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RLS: lectura por rol; escritura NINGUNA (todo escribe el servidor con service role).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.visit_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_survey_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_survey_gifts ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.visit_surveys FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.visit_survey_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.property_survey_gifts FROM anon, authenticated;

DROP POLICY IF EXISTS visit_surveys_select_scoped ON public.visit_surveys;
CREATE POLICY visit_surveys_select_scoped ON public.visit_surveys
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_operations_user())
    OR EXISTS (
      SELECT 1 FROM public.property_visits v
       WHERE v.id = visit_surveys.visit_id
         AND (v.advisor_id = (SELECT auth.uid()) OR v.created_by = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS visit_survey_settings_select_ops ON public.visit_survey_settings;
CREATE POLICY visit_survey_settings_select_ops ON public.visit_survey_settings
  FOR SELECT TO authenticated
  USING ((SELECT public.is_operations_user()));

DROP POLICY IF EXISTS property_survey_gifts_select_scoped ON public.property_survey_gifts;
CREATE POLICY property_survey_gifts_select_scoped ON public.property_survey_gifts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_operations_user())
    OR EXISTS (
      SELECT 1 FROM public.properties p
       WHERE p.id = property_survey_gifts.property_id
         AND (p.assigned_to = (SELECT auth.uid()) OR p.created_by = (SELECT auth.uid()))
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 7) whatsapp_messages.origen suma 'encuesta_visita'. NOT VALID + VALIDATE: el lock pesado
--    dura solo lo que tarda el DROP/ADD, no el recorrido de la tabla.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.whatsapp_messages'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%origen%'
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_messages DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_origen_check
  CHECK (origen IS NULL OR origen IN ('consulta_portal', 'landing', 'manual', 'encuesta_visita')) NOT VALID;
ALTER TABLE public.whatsapp_messages VALIDATE CONSTRAINT whatsapp_messages_origen_check;

COMMENT ON COLUMN public.whatsapp_messages.origen IS
  'De dónde nació la conversación: consulta_portal · landing · manual · encuesta_visita (encuesta post-visita y su regalo). NULL = anterior a 20260806000001.';
