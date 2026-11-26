-- =============================================================================
-- Lista de Meta "DF · EXCLUIR Pidieron tasación" — reemplazo diario (se programa DESPUÉS del deploy)
-- =============================================================================
-- Le pega a /api/cron/meta-exclusion-sync, que no existe hasta que el deploy termine. El script
-- scripts/apply-cron-meta-exclusion-sync-pg.ts verifica el deploy (?ping=1) antes de programar.
--
-- 06:30 UTC = 03:30 de Argentina, todos los días. Quien pide tasación hoy queda excluido mañana.
--
-- OJO con pg_net: net.http_post es fire-and-forget. 'succeeded' en cron.job_run_details NO prueba
-- un 200. Verificar en net._http_response mirando el CONTENIDO ("enviadas") y en
-- funnel_meta_sync_log (stage = 'excluir_pidieron_tasacion').
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-meta-exclusion-sync-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('meta_exclusion_sync', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('meta-exclusion-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'meta-exclusion-sync');

SELECT cron.schedule('meta-exclusion-sync', '30 6 * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/meta-exclusion-sync',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='meta-exclusion-sync';
--   2. SELECT status_code, left(content, 200), created FROM net._http_response
--        WHERE content LIKE '%"enviadas"%' ORDER BY created DESC LIMIT 5;
--   3. SELECT run_at, added, num_received, error FROM funnel_meta_sync_log
--        WHERE stage='excluir_pidieron_tasacion' ORDER BY run_at DESC LIMIT 5;
-- =============================================================================
