-- =============================================================================
-- Publicador de Publicaciones (Instagram + Facebook) — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/publicaciones-publicar cada 2 minutos. Con la publicación
-- automática apagada, la ruta responde "apagado" en milisegundos y no toca nada.
-- Se aplica con scripts/apply-cron-publicaciones-pg.ts, que verifica el deploy
-- (?ping=1) y reemplaza los marcadores.
--
-- pg_net es "mandar y olvidarse": verificar SIEMPRE net._http_response.
-- =============================================================================

DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-publicaciones-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('publicaciones_publicar', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('publicaciones-publicar') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'publicaciones-publicar');

SELECT cron.schedule('publicaciones-publicar', '*/2 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/publicaciones-publicar',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- VERIFICACIÓN:
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='publicaciones-publicar';
--   2. SELECT status_code, left(content,160), created FROM net._http_response
--        WHERE content LIKE '%avanzados%' ORDER BY created DESC LIMIT 5;
--   3. SELECT plataforma, estado, count(*) FROM publicacion_envios GROUP BY 1, 2;
