-- =============================================================================
-- Publicación de reels — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/reels-publish, que NO existe hasta que el deploy termine:
-- programarla antes deja un job dándose contra un 404 cada 5 minutos. El script
-- scripts/apply-cron-reels-pg.ts verifica el deploy (?ping=1) antes de programar.
--
-- CADA 5 MINUTOS, hasta 5 reels por corrida. Con los reels al día, la corrida
-- contesta "nada pendiente" en milisegundos.
--
-- Publicar en Instagram son DOS etapas separadas por minutos (crear el
-- contenedor, esperar a que lo procese, publicarlo). El cron hace UNA etapa por
-- corrida: un reel típico queda publicado en la corrida siguiente a la que lo
-- tomó.
--
-- OJO con pg_net: net.http_post es "mandar y olvidarse". Que
-- cron.job_run_details diga 'succeeded' NO prueba que el endpoint haya
-- respondido 200 — solo que el SQL corrió. Verificar SIEMPRE contra
-- net._http_response (retiene ~6h) y contra property_reels.
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

-- Candado: pegada a mano en el SQL Editor, el secreto quedaría en el literal
-- '__SECRETO__' (que está público en el repo) y cualquiera podría disparar la
-- ruta. El script reemplaza el marcador; la concatenación de abajo no la toca.
DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-reels-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('reels_publish', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('reels-publish') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reels-publish');

SELECT cron.schedule('reels-publish', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/reels-publish',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    -- El default de pg_net son 2000 ms y acá se le habla a Instagram: cortaría
    -- a mitad de camino, dejando reels en 'procesando' para siempre.
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- VERIFICACIÓN (3 capas, en este orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='reels-publish';
--   2. SELECT status_code, left(content,120), created FROM net._http_response
--        ORDER BY created DESC LIMIT 5;
--   3. SELECT estado, count(*) FROM property_reels GROUP BY estado;
-- =============================================================================
