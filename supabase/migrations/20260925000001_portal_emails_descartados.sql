-- =============================================================================
-- Correos de portales que NO son consultas (la publicidad que se descarta)
-- =============================================================================
-- POR QUÉ EXISTE
--
-- El 5/9/2026 Argenprop empezó a mandar su newsletter de "propiedades nuevas
-- para vos" desde `noresponder@argenprop.com`, LA MISMA dirección por la que
-- llegan las consultas reales. Como el filtro de la puerta mira solo el
-- remitente, 10 piezas de publicidad entraron como consultas: avisos de WhatsApp
-- a Diego por avisos de OTRAS inmobiliarias y 6% de ruido en el conteo de
-- septiembre.
--
-- Ahora esos correos se descartan antes de registrarse (ver
-- `lib/integrations/portal-inquiries/es-consulta.ts`). Esta tabla es la
-- CONTRACARA de ese filtro: lo que se descarta queda acá, con el motivo.
--
-- Sin esto, el día que un portal estrene un formato de consulta nuevo, el
-- correo desaparecería sin dejar rastro y el síntoma sería "dejaron de llegar
-- consultas", sin nada para mirar. Un filtro que tira en silencio es peor que el
-- problema que arregla.
--
-- 100% ADITIVA: tabla nueva, no toca nada existente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portal_emails_descartados (
  -- El id del mensaje en Gmail: sirve de clave para no anotarlo dos veces
  -- mientras siga dentro de la ventana que mira el cron.
  gmail_message_id TEXT PRIMARY KEY,
  portal TEXT NOT NULL,
  remitente TEXT,
  asunto TEXT,
  -- En palabras, por qué no se consideró una consulta.
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_emails_descartados_created_at_idx
  ON public.portal_emails_descartados (created_at DESC);

-- RLS: el cron escribe con la service role (salta RLS). Operaciones puede LEER,
-- para poder revisar qué se descartó; nadie más ve nada, y nadie edita a mano.
ALTER TABLE public.portal_emails_descartados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operaciones lee los descartados" ON public.portal_emails_descartados;
CREATE POLICY "operaciones lee los descartados"
  ON public.portal_emails_descartados
  FOR SELECT
  TO authenticated
  USING (public.is_operations_user());

COMMENT ON TABLE public.portal_emails_descartados IS
  'Correos de portales que el filtro NO consideró consultas (publicidad). Contracara de es-consulta.ts: un filtro que tira en silencio es peor que el problema que arregla.';
