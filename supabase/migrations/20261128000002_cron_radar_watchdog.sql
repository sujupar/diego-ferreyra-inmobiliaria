-- =============================================================================
-- Vigilante del radar de referencias — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/radar-watchdog (POST, auth dual), que no existe hasta que el deploy
-- termine. scripts/apply-cron-radar-watchdog-pg.ts verifica el deploy (?ping=1) antes de
-- programar nada.
--
-- CADA HORA (minuto 17): la ruta avisa por mail UNA vez por problema (corrida frenada o con
-- error; o radar sin correr hace más de 36 h, con repetición cada 24 h), así que la
-- frecuencia solo marca qué tan rápido nos enteramos.
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details diga
-- 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar contra
-- net._http_response (retiene ~6h).
--
-- Usa el MISMO secreto que los demás jobs: cron_config('send_report'). Los marcadores
-- __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

-- Candado: pegada a mano en el SQL Editor, el secreto quedaría en el literal
-- '__SECRETO__' (que está en el repo) y cualquiera podría disparar la ruta.
DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-radar-watchdog-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

SELECT cron.unschedule('radar-watchdog') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'radar-watchdog');

SELECT cron.schedule('radar-watchdog', '17 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/radar-watchdog',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación:
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='radar-watchdog';
--   2. SELECT status_code, left(content, 200), created FROM net._http_response
--        ORDER BY created DESC LIMIT 5;
-- =============================================================================
