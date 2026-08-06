-- =============================================================================
-- Sincronización diaria de la inversión de Meta
-- =============================================================================
-- Por qué pg_cron y no una scheduled function de Netlify: el scheduler de
-- Netlify NO invoca las scheduled functions de este sitio (bug del plugin de
-- Next 16 — ver CLAUDE.md). Por eso meta_ads_daily quedó con 24 días de 88 y
-- cortada el 27/5/2026.
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details
-- diga 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar
-- SIEMPRE contra net._http_response (retiene ~6h) y contra los datos.
--
-- NO se aplica a mano: los marcadores __SECRETO__ y __SITIO__ los reemplaza
-- scripts/apply-cron-meta-sync-pg.ts con los valores que dé el usuario.
-- Requiere que el código esté DEPLOYADO: apunta a una URL que antes no existe.
-- =============================================================================

INSERT INTO public.cron_config (key, value)
VALUES ('meta_sync', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('meta-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'meta-sync');

SELECT cron.schedule('meta-sync', '30 9 * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/meta-sync?days=7',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT * FROM cron.job WHERE jobname='meta-sync';
--   2. SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--   3. SELECT max(date) FROM meta_ads_daily;   -- debe avanzar cada día
-- =============================================================================
