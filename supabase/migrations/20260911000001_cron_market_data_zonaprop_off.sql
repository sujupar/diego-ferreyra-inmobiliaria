-- Apaga el scraping de tipos de propiedades POR BARRIO (Zonaprop vía ScraperAPI).
-- Decisión del dueño, 2026-09-11: los datos por barrio ya no van en el PDF de la
-- tasación y ese job gastaba créditos de ScraperAPI (48 páginas por mes).
-- NO se borran los datos ni las tablas: `market_snapshot_neighborhood` y
-- `market_data_refresh_state` quedan como están. `market-data-core` (stock CABA +
-- escrituras, que el PDF sí muestra) sigue programado.
-- Para volver a encenderlo: correr de nuevo `20260701000012_cron_market_data.sql`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'market-data-zonaprop') THEN
    PERFORM cron.unschedule('market-data-zonaprop');
    RAISE NOTICE 'market-data-zonaprop: apagado';
  ELSE
    RAISE NOTICE 'market-data-zonaprop: ya no estaba programado';
  END IF;
END $$;

UPDATE market_data_refresh_state
   SET last_status = 'ok',
       last_error  = 'APAGADO 2026-09-11: los tipos por barrio ya no van en el PDF; el job se desprogramó para no gastar ScraperAPI.'
 WHERE id = 'zonaprop';
