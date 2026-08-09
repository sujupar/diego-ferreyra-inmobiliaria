-- =============================================================================
-- Worker de los avisos del embudo — se programa DESPUÉS del deploy
-- =============================================================================
-- NO se aplica junto con 20260808000001. Este job hace un POST a
-- /api/cron/funnel-side-effects, una ruta que NO existe hasta que el deploy
-- termine: programarla antes deja un job pegándole a un 404 cada minuto. Es
-- exactamente el error que ya documentó el proyecto con `meta-sync`.
--
-- Por qué pg_cron y no una scheduled function de Netlify: el scheduler de
-- Netlify NO invoca las scheduled functions de este sitio (bug del plugin sobre
-- Next 16 — ver CLAUDE.md). pg_cron sí: hay 11 jobs vivos y `publish-listings`
-- corre cada minuto.
--
-- CADA MINUTO a propósito: acá viaja el aviso de un lead pago. El peor caso de
-- demora del email a la coordinadora pasa a ser ~60 s (antes era inmediato pero
-- se llevaba puesto el request cuando Resend colgaba).
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details
-- diga 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar
-- SIEMPRE contra net._http_response (retiene ~6h) y contra los datos.
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza
-- scripts/apply-cron-funnel-side-effects-pg.ts con los valores que dé el usuario.
-- =============================================================================

INSERT INTO public.cron_config (key, value)
VALUES ('funnel_side_effects', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('funnel-side-effects') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'funnel-side-effects');

SELECT cron.schedule('funnel-side-effects', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/funnel-side-effects',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='funnel-side-effects';
--   2. SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--   3. SELECT status, count(*) FROM funnel_lead_jobs GROUP BY status;
--      -- 'pending' no debe acumularse; 'failed' debe ser cero.
-- =============================================================================
