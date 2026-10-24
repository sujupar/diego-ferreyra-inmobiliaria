-- =============================================================================
-- Ciclo automático del informe quincenal — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/informes-quincenales (POST, auth dual), que no existe hasta que el deploy
-- termine. El script scripts/apply-cron-informes-quincenales-pg.ts verifica el deploy (?ping=1)
-- antes de programar nada.
--
-- CADA 2 MINUTOS los días 1, 2, 16 y 17 (hora del servidor, UTC). La ruta decide el día en hora
-- de Argentina y fuera de esos días no hace nada (motivo 'fuera_de_fecha'): a las 00:00–02:59 UTC
-- del 1 todavía es el último día del mes en Buenos Aires, y esas corridas salen sin tocar nada.
-- Cada corrida crea los borradores que falten, trae fuentes con presupuesto de 8 s y, cuando la
-- tanda terminó, avisa a la coordinación (lib/informes/ciclo-servicio.ts). Con 36 propiedades la
-- tanda se completa en ~1 hora. El 2 y el 17 son repechaje (mismo período, no duplica nada).
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details diga 'succeeded' NO
-- prueba un 200. Verificar contra net._http_response (mirar el CONTENIDO: lleva "creados").
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-informes-quincenales-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('informes_quincenales', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('informes-quincenales') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'informes-quincenales');

SELECT cron.schedule('informes-quincenales', '*/2 * 1,2,16,17 * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/informes-quincenales',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='informes-quincenales';
--   2. SELECT status_code, left(content, 300), created FROM net._http_response
--        WHERE content LIKE '%"creados"%' ORDER BY created DESC LIMIT 5;
--   3. SELECT estado, count(*), count(avisado_at) FROM property_reports WHERE origen='ciclo' GROUP BY 1;
-- =============================================================================
