-- Agenda el sync de Públicos por etapa cada 30 min vía pg_cron + pg_net
-- (POST a la ruta Next con x-cron-secret). Copia el patrón net.http_post de un
-- cron existente y cambia la URL. NO aplicar hasta el go-live de Fase 4
-- (ToS de Custom Audiences aceptados + Advanced Access confirmados).
-- Correr a mano en el SQL Editor del Dashboard.

do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where command ilike '%/api/cron/%' limit 1;
  if v_cmd is null then
    raise exception 'No hay cron previo para copiar el patrón net.http_post — crear el job a mano.';
  end if;
  v_cmd := regexp_replace(
    v_cmd,
    'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
    'https://inmodf.com.ar/api/cron/meta-audience-sync'
  );
  if exists (select 1 from cron.job where jobname = 'meta-audience-sync') then
    perform cron.unschedule('meta-audience-sync');
  end if;
  perform cron.schedule('meta-audience-sync', '*/30 * * * *', v_cmd);
  raise notice 'OK: job meta-audience-sync agendado (*/30).';
end $$;
