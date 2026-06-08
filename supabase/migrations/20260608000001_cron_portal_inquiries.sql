-- Cron del escaneo de consultas de portales vía pg_cron (el scheduler de Netlify
-- no dispara en este sitio — ver CLAUDE.md). Corre cada 5 min y pega a
-- POST /api/cron/portal-inquiries (que valida x-cron-secret == CRON_SECRET).
--
-- AUTO-SUFICIENTE Y A PRUEBA DE BALAS: copia el comando completo de CUALQUIER cron
-- que ya pegue a /api/cron/ (todos comparten el mismo secreto, sea inline o desde
-- cron_config) y solo le cambia la URL al endpoint de portal-inquiries.
-- Idempotente: recrea el job si ya existía. Correr tal cual.
DO $$
DECLARE
  v_cmd text;
BEGIN
  SELECT command INTO v_cmd
  FROM cron.job
  WHERE command ILIKE '%/api/cron/%'
    AND jobname <> 'portal-inquiries'
  LIMIT 1;

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'No encontré ningún cron que pegue a /api/cron/. Corré primero el de publish-listings, o pasame: SELECT jobname, command FROM cron.job;';
  END IF;

  -- Cambiar solo el endpoint (saca cualquier ?querystring del cron copiado).
  v_cmd := regexp_replace(
    v_cmd,
    'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
    'https://inmodf.com.ar/api/cron/portal-inquiries'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'portal-inquiries') THEN
    PERFORM cron.unschedule('portal-inquiries');
  END IF;

  PERFORM cron.schedule('portal-inquiries', '*/5 * * * *', v_cmd);
  RAISE NOTICE 'OK: job portal-inquiries creado (cada 5 min) copiando el mecanismo de otro cron.';
END $$;

-- VERIFICACIÓN (3 capas):
--   1. SELECT * FROM cron.job WHERE jobname = 'portal-inquiries';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='portal-inquiries')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;  -- esperar 200
--      Y el estado de la corrida:
--      SELECT last_polled_at, last_run_stats FROM portal_inquiry_poll_state WHERE id = 1;
--
-- NOTA: para que ingrese consultas reales, además del cron hace falta:
--   - GMAIL_SA_CLIENT_EMAIL / GMAIL_SA_PRIVATE_KEY / GMAIL_IMPERSONATE_EMAIL (sino loguea 'skipped')
--   - haber corrido la migración 20260603000001_portal_inquiries.sql (tablas)
