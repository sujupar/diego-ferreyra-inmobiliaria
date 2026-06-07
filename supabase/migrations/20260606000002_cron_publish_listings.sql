-- Worker de publicación de portales vía pg_cron (el scheduler de Netlify no dispara
-- en este sitio — ver CLAUDE.md). Mismo patrón que el job report-daily.
--
-- AUTO-SUFICIENTE: este script copia solo el x-cron-secret del job 'report-daily'
-- que ya funciona, así no hay que pegar ninguna contraseña a mano. Es idempotente:
-- si el job 'publish-listings' ya existía (aunque haya quedado mal), lo recrea bien.
-- Correr tal cual.
DO $$
DECLARE
  v_secret text;
BEGIN
  -- 1. Sacar el secreto del comando del job report-daily (está inlineado ahí).
  SELECT (regexp_match(command, 'x-cron-secret''\s*,\s*''([^'']+)'''))[1]
    INTO v_secret
  FROM cron.job
  WHERE jobname = 'report-daily'
  LIMIT 1;

  IF v_secret IS NULL OR v_secret = '<CRON_SECRET>' THEN
    RAISE EXCEPTION 'No pude extraer el x-cron-secret de report-daily. Corré: SELECT command FROM cron.job WHERE jobname = ''report-daily'';  y pasámelo.';
  END IF;

  -- 2. Si el job ya existía (p. ej. creado antes con el placeholder), borrarlo.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-listings') THEN
    PERFORM cron.unschedule('publish-listings');
  END IF;

  -- 3. Crear el job con el secreto real (format %L escapa la cadena de forma segura).
  PERFORM cron.schedule(
    'publish-listings',
    '* * * * *',
    format(
      $f$select net.http_post(url := 'https://inmodf.com.ar/api/cron/publish-listings', headers := jsonb_build_object('x-cron-secret', %L), body := '{}'::jsonb, timeout_milliseconds := 30000);$f$,
      v_secret
    )
  );
  RAISE NOTICE 'Job publish-listings creado con el secreto de report-daily.';
END $$;

-- VERIFICACIÓN (3 capas):
--   1. SELECT * FROM cron.job WHERE jobname = 'publish-listings';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='publish-listings')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;  -- esperar 200/403
--      (403 = el secreto no coincide; 200 = OK)
--
-- Para cambiar la frecuencia: select cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname='publish-listings'), schedule := '*/2 * * * *');
