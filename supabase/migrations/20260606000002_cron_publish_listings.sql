-- Worker de publicación de portales vía pg_cron (el scheduler de Netlify no dispara
-- en este sitio — ver CLAUDE.md). Mismo patrón que el job report-daily.
--
-- ANTES DE CORRER: reemplazar <CRON_SECRET> por el valor real (el mismo que usa
-- report-daily) y confirmar el host con:
--   SELECT jobname, command FROM cron.job WHERE jobname = 'report-daily';
--
select cron.schedule(
  'publish-listings',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://inmodf.com.ar/api/cron/publish-listings',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $$
);

-- VERIFICACIÓN (3 capas):
--   1. SELECT * FROM cron.job WHERE jobname = 'publish-listings';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='publish-listings')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;  -- esperar 200
--
-- Para cambiar la frecuencia: select cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname='publish-listings'), schedule := '*/2 * * * *');
