-- Cron de datos de mercado (pg_cron — las Netlify scheduled functions no disparan).
-- CORRER DESPUÉS del deploy que incluye /api/cron/refresh-market-data.
-- Copia el comando (con el secreto) de cualquier cron existente y cambia la URL.
DO $$
DECLARE
  v_cmd text;
  v_core text;
  v_zp text;
BEGIN
  SELECT command INTO v_cmd FROM cron.job
  WHERE command ILIKE '%/api/cron/%'
    AND jobname NOT IN ('market-data-core','market-data-zonaprop')
  LIMIT 1;
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'No encontré ningún cron que pegue a /api/cron/. Corré: SELECT jobname, command FROM cron.job;';
  END IF;

  v_core := regexp_replace(v_cmd, 'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
            'https://inmodf.com.ar/api/cron/refresh-market-data?part=core');
  v_zp   := regexp_replace(v_cmd, 'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
            'https://inmodf.com.ar/api/cron/refresh-market-data?part=zonaprop');

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='market-data-core') THEN PERFORM cron.unschedule('market-data-core'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='market-data-zonaprop') THEN PERFORM cron.unschedule('market-data-zonaprop'); END IF;

  -- core: diario 09:15 UTC (barato: 3 GETs). Mantiene fresco el mes vigente y
  -- levanta el artículo de escrituras cuando el Colegio lo publica (~día 23).
  PERFORM cron.schedule('market-data-core', '15 9 * * *', v_core);
  -- zonaprop: cada 2h, 12 barrios por corrida; con el período completo sale
  -- temprano (pending=0, costo ≈ 1 query). Tras el cambio de mes se auto-completa en ~8h.
  PERFORM cron.schedule('market-data-zonaprop', '0 */2 * * *', v_zp);
  RAISE NOTICE 'OK: market-data-core + market-data-zonaprop registrados.';
END $$;

-- VERIFICACIÓN (3 capas):
--   1. SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'market-data%';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'market-data%')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;  -- esperar 200
--   4. SELECT * FROM market_data_refresh_state;   -- last_status='ok'
