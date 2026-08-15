-- Registro de intentos de registro RECHAZADOS en el embudo.
--
-- Hasta hoy, un envío que no pasaba la validación desaparecía sin dejar rastro:
-- la validación corre antes de cualquier escritura. El 2026-08-14 una clienta
-- real no pudo registrarse ("datos inválidos" — su clic de anuncio traía una
-- cookie _fbc más larga que el tope del schema) y no había forma de saber quién
-- era ni cuántos más habían rebotado. Se pagó por cada uno de esos clics.
--
-- Con el schema nuevo (2026-08-15) el rechazo es casi imposible para un humano,
-- pero "casi" no es un número: TODO rechazo queda acá, con lo que la persona
-- tipeó, para poder contactarla a mano.
--
-- Es una tabla de operaciones, no de tracking: guarda datos de contacto de
-- gente que INTENTÓ registrarse. RLS de lectura solo para el equipo.

CREATE TABLE IF NOT EXISTS public.funnel_submit_rejections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel     TEXT,
  name       TEXT,
  email      TEXT,
  phone      TEXT,
  -- 'schema' (no pasó la validación), 'sin_canal_usable' (ni email ni teléfono
  -- servibles), 'json_invalido' (body roto, casi seguro un bot).
  motivo     TEXT NOT NULL,
  detalle    JSONB,
  ip_hash    TEXT,
  user_agent TEXT,
  -- Para marcar el seguimiento a mano ("la llamé, se registró de nuevo").
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_submit_rejections_created
  ON public.funnel_submit_rejections (created_at DESC);

ALTER TABLE public.funnel_submit_rejections ENABLE ROW LEVEL SECURITY;

-- Escribe SOLO el service role (la ruta del embudo). El equipo de operaciones lee.
DROP POLICY IF EXISTS funnel_submit_rejections_select ON public.funnel_submit_rejections;
CREATE POLICY funnel_submit_rejections_select
  ON public.funnel_submit_rejections FOR SELECT
  TO authenticated
  USING (public.is_operations_user());
