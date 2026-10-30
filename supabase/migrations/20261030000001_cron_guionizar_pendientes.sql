-- =============================================================================
-- Guionizador de noticias pendientes — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/guionizar-pendientes (POST, auth dual), que no existe hasta que el
-- deploy termine. El script scripts/apply-cron-guionizar-pendientes-pg.ts verifica el
-- deploy (?ping=1) antes de programar nada.
--
-- CADA MINUTO: hay que vaciar la cola rápido (el usuario queda esperando el aviso por
-- Telegram de que sus guiones están listos). Cada corrida toma UNA pieza 'guionizando'
-- (PRESUPUESTO_MS = 26_000 - GEMINI_TIMEOUT_MS - 1_000, ver app/api/cron/guionizar-pendientes/route.ts),
-- así que una cola de varias piezas se vacía en varios minutos, no en una corrida.
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details diga
-- 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar SIEMPRE contra
-- net._http_response (retiene ~6h) y contra news_scripts (estado='listo'/'error').
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

-- Candado: pegada a mano en el SQL Editor, el secreto quedaría en el literal
-- '__SECRETO__' (que está en el repo) y cualquiera podría disparar la ruta.
DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-guionizar-pendientes-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('guionizar_pendientes', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('guionizar-pendientes') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'guionizar-pendientes');

SELECT cron.schedule('guionizar-pendientes', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/guionizar-pendientes',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='guionizar-pendientes';
--   2. SELECT status_code, left(content, 200), created FROM net._http_response
--        ORDER BY created DESC LIMIT 5;
--   3. SELECT estado, count(*) FROM news_scripts GROUP BY estado; -- 'guionizando' no debe acumularse
-- =============================================================================
