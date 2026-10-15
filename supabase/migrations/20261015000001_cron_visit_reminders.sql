-- =============================================================================
-- Recordatorio "¿se realizó?" al asesor — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/visit-reminders (POST, auth dual), que en su versión nueva no
-- existe hasta que el deploy termine. El script scripts/apply-cron-visit-reminders-pg.ts
-- verifica el deploy (?ping=1) antes de programar nada.
--
-- CADA HORA, al minuto 5. Cada corrida avisa las visitas CONFIRMADAS que pasaron hace
-- entre 1 h y 48 h, sin resultado y sin aviso (lib/visitas/recordatorio.ts). La ventana
-- de 48 h hace que la PRIMERA corrida no mande una ráfaga por visitas viejas.
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details diga
-- 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar SIEMPRE contra
-- net._http_response (retiene ~6h, mirar el CONTENIDO: varios jobs devuelven 200) y
-- contra email_notifications_log (notification_type='visit_reminder_advisor').
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

-- Candado: pegada a mano en el SQL Editor, el secreto quedaría en el literal
-- '__SECRETO__' (que está en el repo) y cualquiera podría disparar la ruta.
DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-visit-reminders-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('visit_reminders', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('visit-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'visit-reminders');

SELECT cron.schedule('visit-reminders', '5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/visit-reminders',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='visit-reminders';
--   2. SELECT status_code, left(content, 200), created FROM net._http_response
--        WHERE content LIKE '%"ventana"%' ORDER BY created DESC LIMIT 5;
--   3. SELECT status, recipient_email, created_at FROM email_notifications_log
--        WHERE notification_type='visit_reminder_advisor' ORDER BY created_at DESC LIMIT 10;
-- =============================================================================
