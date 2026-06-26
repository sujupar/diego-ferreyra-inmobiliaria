-- =============================================================================
-- Migration: Consultas de portales (Gmail → parseo → asignación → WhatsApp)
-- Date: 2026-06-03
--
-- CONTEXTO
-- --------
-- Cuando una persona pide info de una propiedad en MercadoLibre / ZonaProp /
-- Argenprop, llega un email a la casilla del negocio. Un cron escanea esa
-- casilla (Gmail API), parsea el lead + la propiedad, identifica al asesor
-- dueño de esa publicación (Diego=dueno, Lucas=asesor) y dispara un WhatsApp.
--
-- Esta migración es 100% ADITIVA: 4 tablas nuevas, sin tocar nada existente.
--
--   1. portal_property_map         -- la "lista": publicación de portal → asesor
--   2. portal_inquiries            -- cada consulta parseada (dedup por gmail msg)
--   3. portal_inquiry_notifications-- auditoría de envíos WhatsApp (idempotencia)
--   4. portal_inquiry_poll_state   -- singleton de estado del polling
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar el contenido de este archivo y ejecutar.
-- 3. Idempotente: re-ejecutar es seguro.
--
-- NOTA sobre triggers: el único trigger acá es touch_updated_at(), que SOLO
-- modifica NEW.updated_at del propio row (no escribe en otra tabla). Es el
-- patrón seguro ya usado por property_leads — NO es el patrón hazard de un
-- BEFORE trigger que inserta en otra tabla con FK al row actual.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. portal_property_map — la lista propiedad(publicación) → asesor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_property_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal text NOT NULL,                                  -- mercadolibre | argenprop | zonaprop
  external_code text,                                    -- código/ID del aviso en el portal (match exacto)
  external_url text,                                     -- link público del aviso (match exacto alternativo)
  address text,                                          -- dirección del aviso (fallback fuzzy)
  neighborhood text,
  title text,                                            -- título del aviso (fallback fuzzy)
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_map_portal_code
  ON public.portal_property_map (portal, external_code);
CREATE INDEX IF NOT EXISTS idx_portal_map_address_lower
  ON public.portal_property_map (lower(address)) WHERE address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_map_assigned
  ON public.portal_property_map (assigned_to) WHERE assigned_to IS NOT NULL;

COMMENT ON TABLE public.portal_property_map IS
  'Lista de publicaciones en portales y su asesor responsable. Sembrada desde la lista que aporta el negocio.';
COMMENT ON COLUMN public.portal_property_map.portal IS 'mercadolibre | argenprop | zonaprop';

-- updated_at auto-touch (reusa touch_updated_at de migración anterior; NEW-only, seguro)
DROP TRIGGER IF EXISTS trg_touch_portal_property_map ON public.portal_property_map;
CREATE TRIGGER trg_touch_portal_property_map
  BEFORE UPDATE ON public.portal_property_map
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. portal_inquiries — cada consulta parseada de un email de portal
-- ---------------------------------------------------------------------------
-- Secuencia para el "#número de lead" mostrado en la notificación (#152, …).
CREATE SEQUENCE IF NOT EXISTS public.portal_inquiries_seq;

CREATE TABLE IF NOT EXISTS public.portal_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint NOT NULL DEFAULT nextval('public.portal_inquiries_seq'), -- #número de lead
  portal text NOT NULL,                                  -- mercadolibre | argenprop | zonaprop
  inquiry_type text,                                     -- mail | whatsapp | phone | null
  gmail_message_id text NOT NULL,                        -- ID del mensaje Gmail (dedup/idempotencia)
  gmail_thread_id text,
  received_at timestamptz,                               -- fecha del email
  lead_name text,
  lead_email text,
  lead_phone text,
  lead_message text,
  property_external_code text,                           -- código del aviso extraído del email
  property_url text,
  property_address text,
  matched_map_id uuid REFERENCES public.portal_property_map(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_unmatched boolean NOT NULL DEFAULT false,           -- true si no se pudo matchear → fallback a Diego
  raw_subject text,
  raw_snippet text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- UNIQUE sobre gmail_message_id: garantiza idempotencia del polling (upsert onConflict).
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_inquiries_gmail_message
  ON public.portal_inquiries (gmail_message_id);

CREATE INDEX IF NOT EXISTS idx_portal_inquiries_assigned
  ON public.portal_inquiries (assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_portal
  ON public.portal_inquiries (portal, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_unmatched
  ON public.portal_inquiries (is_unmatched, created_at DESC);

COMMENT ON TABLE public.portal_inquiries IS
  'Consultas entrantes parseadas desde los emails de notificación de los portales.';

-- La secuencia pertenece a la columna (se limpia con la tabla).
ALTER SEQUENCE public.portal_inquiries_seq OWNED BY public.portal_inquiries.seq;

-- ---------------------------------------------------------------------------
-- 3. portal_inquiry_notifications — auditoría de envíos WhatsApp
-- (espejo de email_notifications_log; idempotencia por (inquiry, recipient))
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_inquiry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.portal_inquiries(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  recipient_phone text NOT NULL,
  recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL,                                  -- sent | failed | skipped
  provider_message_id text,                              -- wamid de Meta
  error_message text,
  test_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Idempotencia: un solo envío 'sent' por (inquiry, destinatario). Reintentos
-- de envíos 'failed' siguen permitidos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_inquiry_notif_sent
  ON public.portal_inquiry_notifications (inquiry_id, recipient_phone)
  WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_portal_inquiry_notif_inquiry
  ON public.portal_inquiry_notifications (inquiry_id, created_at DESC);

COMMENT ON COLUMN public.portal_inquiry_notifications.status IS 'sent | failed | skipped';

-- ---------------------------------------------------------------------------
-- 4. portal_inquiry_poll_state — singleton de estado del polling
-- (espejo de ghl_poll_state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_inquiry_poll_state (
  id integer PRIMARY KEY DEFAULT 1,
  last_polled_at timestamptz,
  last_run_stats jsonb,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  updated_at timestamptz DEFAULT NOW(),
  CONSTRAINT portal_inquiry_poll_state_singleton CHECK (id = 1)
);

INSERT INTO public.portal_inquiry_poll_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- RLS
-- =============================================================================

-- --- portal_property_map ---------------------------------------------------
ALTER TABLE public.portal_property_map ENABLE ROW LEVEL SECURITY;

-- SELECT: operations (admin/dueno/coordinador) ven todo; asesor ve solo lo suyo.
DROP POLICY IF EXISTS portal_map_select ON public.portal_property_map;
CREATE POLICY portal_map_select ON public.portal_property_map
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND assigned_to = p.id)
        )
    )
  );

-- UPDATE: solo operations (corregir asignación, código, etc.).
DROP POLICY IF EXISTS portal_map_update ON public.portal_property_map;
CREATE POLICY portal_map_update ON public.portal_property_map
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'dueno', 'coordinador')
    )
  );
-- INSERT/DELETE solo service_role (seed/admin client). Sin policy = deny.

-- --- portal_inquiries -------------------------------------------------------
ALTER TABLE public.portal_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_inquiries_select ON public.portal_inquiries;
CREATE POLICY portal_inquiries_select ON public.portal_inquiries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND assigned_to = p.id)
        )
    )
  );

DROP POLICY IF EXISTS portal_inquiries_update ON public.portal_inquiries;
CREATE POLICY portal_inquiries_update ON public.portal_inquiries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND assigned_to = p.id)
        )
    )
  );
-- INSERT/DELETE solo service_role (el cron usa service role). Sin policy = deny.

-- --- portal_inquiry_notifications (solo lectura para operations/debug) ------
ALTER TABLE public.portal_inquiry_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_inquiry_notif_select ON public.portal_inquiry_notifications;
CREATE POLICY portal_inquiry_notif_select ON public.portal_inquiry_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dueno')
    )
  );
-- writes solo service_role.

-- --- portal_inquiry_poll_state (solo lectura admin/dueno) -------------------
ALTER TABLE public.portal_inquiry_poll_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_inquiry_poll_state_select ON public.portal_inquiry_poll_state;
CREATE POLICY portal_inquiry_poll_state_select ON public.portal_inquiry_poll_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dueno')
    )
  );
-- service role bypassa RLS por defecto.

-- =============================================================================
-- Verificación post-migration (opcional)
-- =============================================================================
-- SELECT count(*) FROM portal_property_map;          -- 0 al inicio
-- SELECT count(*) FROM portal_inquiries;             -- 0 al inicio
-- SELECT * FROM portal_inquiry_poll_state;           -- 1 fila (id=1, nulls)
