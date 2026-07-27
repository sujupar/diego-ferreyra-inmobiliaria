-- =============================================================================
-- Alerta de sequía de emails de portales
-- =============================================================================
-- Contexto (2026-07): la casilla contacto@ quedó sin MX 8 días (cambio de DNS)
-- y nadie lo notó porque el cron seguía "ok" con fetched=0. Estas columnas
-- persisten la señal para alertar por WhatsApp tras 48h sin NINGÚN email de
-- portales (ni siquiera duplicados) — ver app/api/cron/portal-inquiries.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.portal_inquiry_poll_state
  ADD COLUMN IF NOT EXISTS last_nonzero_fetch_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_drought_alert_at timestamptz;

COMMENT ON COLUMN public.portal_inquiry_poll_state.last_nonzero_fetch_at IS
  'Última corrida del cron en que Gmail devolvió >=1 email de portales (fetched>0). Base de la alerta de sequía.';
COMMENT ON COLUMN public.portal_inquiry_poll_state.last_drought_alert_at IS
  'Último WhatsApp de alerta de sequía enviado (throttle: máx 1 por 24h).';

-- Seed: arrancar el reloj desde ahora (el correo se restauró hoy) para no
-- disparar una alerta falsa por el histórico de la sequía ya resuelta.
UPDATE public.portal_inquiry_poll_state
   SET last_nonzero_fetch_at = NOW()
 WHERE id = 1 AND last_nonzero_fetch_at IS NULL;
