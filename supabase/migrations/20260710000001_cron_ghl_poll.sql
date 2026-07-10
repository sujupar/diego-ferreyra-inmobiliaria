-- Reactiva el POLL de GHL vía pg_cron (el scheduler de Netlify no dispara en este
-- sitio — ver CLAUDE.md). El poll nunca se había enganchado: ghl_poll_state tenía
-- last_polled_at = NULL desde 2026-05-15, así que NINGÚN lead de GHL entró al
-- sistema desde el bulk import del 14-may. El backfill ya trajo los faltantes; esto
-- deja el poll corriendo cada 10 min para que los NUEVOS sigan entrando.
--
-- A PRUEBA DE BALAS: en vez de pegar el x-cron-secret a mano, copia el comando de
-- un cron que YA funciona (preferimos send-report: sabemos que llega, así que su
-- secreto matchea process.env.CRON_SECRET, que es exactamente lo que valida
-- /api/cron/ghl-poll). Solo le cambia la URL al endpoint. Idempotente.
-- Correr tal cual en el SQL Editor.
DO $$
DECLARE
  v_cmd text;
BEGIN
  -- 1) Preferir el cron de reportes (secreto conocido-bueno).
  SELECT command INTO v_cmd
  FROM cron.job
  WHERE command ILIKE '%/api/cron/send-report%'
  LIMIT 1;

  -- 2) Fallback: cualquier otro cron que pegue a /api/cron/.
  IF v_cmd IS NULL THEN
    SELECT command INTO v_cmd
    FROM cron.job
    WHERE command ILIKE '%/api/cron/%'
      AND jobname <> 'ghl-poll'
    LIMIT 1;
  END IF;

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'No encontré ningún cron que pegue a /api/cron/. Corré: SELECT jobname, command FROM cron.job;';
  END IF;

  -- Cambiar SOLO el endpoint (saca cualquier ?querystring del cron copiado).
  v_cmd := regexp_replace(
    v_cmd,
    'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
    'https://inmodf.com.ar/api/cron/ghl-poll'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ghl-poll') THEN
    PERFORM cron.unschedule('ghl-poll');
  END IF;

  PERFORM cron.schedule('ghl-poll', '*/10 * * * *', v_cmd);
  RAISE NOTICE 'OK: job ghl-poll creado (cada 10 min) copiando el mecanismo de otro cron.';
END $$;

-- VERIFICACIÓN (3 capas — esperá ~10 min a que corra una vez):
--   1. SELECT * FROM cron.job WHERE jobname = 'ghl-poll';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='ghl-poll')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;  -- 200 = OK, 403 = secreto no matchea
--
-- Confirmación final (que importó): SELECT last_polled_at, last_run_stats
--   FROM ghl_poll_state WHERE id = 1;   -- last_polled_at debe avanzar y last_run_stats mostrar el conteo.
--
-- Si da 403: el cron copiado usaba otro secreto. Copiá el comando de OTRO cron
--   (SELECT jobname, command FROM cron.job;) que devuelva 200 y reemplazá la URL a
--   /api/cron/ghl-poll a mano.
--
-- Cambiar la frecuencia: SELECT cron.alter_job(
--   (SELECT jobid FROM cron.job WHERE jobname='ghl-poll'), schedule := '*/5 * * * *');
