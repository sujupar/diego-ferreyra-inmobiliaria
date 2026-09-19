-- =============================================================================
-- Actualización mensual del mapa propio — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/mapa-lugares, que no existe hasta que el deploy termine:
-- programarla antes deja un job pegándole a un 404. El script
-- scripts/apply-cron-mapa-lugares-pg.ts verifica el deploy (?ping=1) antes.
--
-- CADA 5 MINUTOS, UNA celda por corrida (la que tiene los datos más viejos, si
-- pasaron más de 30 días). Con los datos al día, cada corrida contesta "nada
-- que hacer" en milisegundos. Es un EXTRA: baja de los servidores públicos de
-- Overpass, que a veces no responden a tiempo; una celda que falla conserva
-- sus datos y se reintenta a la hora. La actualización completa y confiable es
-- volver a correr la carga desde Geofabrik (ver CLAUDE.md § mapa propio).
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details
-- diga 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar
-- SIEMPRE contra net._http_response (retiene ~6h) y contra mapa_celdas.
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

INSERT INTO public.cron_config (key, value)
VALUES ('mapa_lugares', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('mapa-lugares') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mapa-lugares');

SELECT cron.schedule('mapa-lugares', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/mapa-lugares',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='mapa-lugares';
--   2. SELECT status_code, left(content, 120), created FROM net._http_response ORDER BY created DESC LIMIT 5;
--   3. SELECT estado, count(*), min(actualizado_en) FROM mapa_celdas GROUP BY estado;
-- =============================================================================
