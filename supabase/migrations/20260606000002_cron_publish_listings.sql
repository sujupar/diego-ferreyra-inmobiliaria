-- Worker de publicación de portales vía pg_cron (el scheduler de Netlify no dispara
-- en este sitio — ver CLAUDE.md). Mismo patrón que los demás crons (report-daily,
-- ghl-poll, etc.).
--
-- AUTO-SUFICIENTE Y A PRUEBA DE BALAS: en vez de pegar el x-cron-secret a mano,
-- copia el comando completo de CUALQUIER cron que ya pegue a /api/cron/ (todos
-- comparten el mismo secreto, sea inline o desde cron_config) y solo le cambia la
-- URL al endpoint de publish-listings. Idempotente: recrea el job si ya existía.
-- Correr tal cual.
DO $$
DECLARE
  v_cmd text;
BEGIN
  SELECT command INTO v_cmd
  FROM cron.job
  WHERE command ILIKE '%/api/cron/%'
    AND jobname <> 'publish-listings'
  LIMIT 1;

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'No encontré ningún cron que pegue a /api/cron/. Corré: SELECT jobname, command FROM cron.job;';
  END IF;

  -- Cambiar solo el endpoint (saca cualquier ?querystring del cron copiado).
  v_cmd := regexp_replace(
    v_cmd,
    'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
    'https://inmodf.com.ar/api/cron/publish-listings'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-listings') THEN
    PERFORM cron.unschedule('publish-listings');
  END IF;

  PERFORM cron.schedule('publish-listings', '* * * * *', v_cmd);
  RAISE NOTICE 'OK: job publish-listings creado copiando el mecanismo de otro cron.';
END $$;

-- VERIFICACIÓN (3 capas):
--   1. SELECT * FROM cron.job WHERE jobname = 'publish-listings';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='publish-listings')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;  -- esperar 200
--      (403 = el secreto no coincide; 200 = OK)
--
-- Para cambiar la frecuencia: select cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname='publish-listings'), schedule := '*/2 * * * *');
