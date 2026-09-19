-- Mapa de calor: los clics por sección se MULTIPLICABAN por la cantidad de etapas.
--
-- `heatmap_section_stats` agrupa las secciones por (página, sección, segmento, ETAPA,
-- dispositivo), pero los clics se contaban por (página, sección, dispositivo, segmento)
-- —sin etapa— y se pegaban con un LEFT JOIN que tampoco miraba la etapa. Resultado:
-- CADA fila de etapa de los "registrados" repetía el TOTAL de clics de todos los
-- registrados. Las pantallas (panel de /embudos y visor) suman las filas, así que con
-- N etapas los clics de los registrados salían N veces.
--
-- Dato real del 2026-09-19, hero de la landing A en celular: 35 clics de anónimos +
-- 15 de registrados = 50 clics reales. Los registrados aparecían en 5 filas de etapa,
-- cada una con clicks=15 → el panel mostraba 110. Total de la página A: 192 mostrados
-- contra 108 reales. La landing B daba bien SOLO porque todos sus registrados estaban
-- en una única etapa; con el primer lead de la B que avanzara, se inflaba igual. Y el
-- selector nuevo Versión A / Versión B invita a comparar justo esos dos números.
--
-- Arreglo: los clics se cuentan CON la etapa del contacto (misma subconsulta que usan
-- las secciones) y el join también la mira. `IS NOT DISTINCT FROM` porque la etapa de
-- los anónimos es NULL y `NULL = NULL` no empareja.
--
-- Mismo tipo de retorno → alcanza con CREATE OR REPLACE (no hace falta DROP). Es
-- compatible con el código ya desplegado: cambia los números, no la forma.

create or replace function public.heatmap_section_stats(p_from timestamptz, p_to timestamptz)
returns table (page text, section text, segment text, stage text, device text,
               reached bigint, avg_visible_ms numeric, clicks bigint)
language sql stable security definer set search_path = public as $$
  with secs as (
    select ss.page, ss.section, ss.anon_id,
      case when ss.contact_id is null then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d where d.contact_id = ss.contact_id order by d.created_at desc limit 1) as stage,
      coalesce((select device from public.heatmap_session_state hs where hs.anon_id = ss.anon_id and hs.page = ss.page), 'desktop') as device,
      ss.reached, ss.visible_ms
    from public.heatmap_section_state ss
    where ss.updated_at >= p_from and ss.updated_at < p_to
  ),
  clk_base as (
    select c.page, c.section, coalesce(c.device, 'desktop') as device,
      case when c.contact_id is null then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d where d.contact_id = c.contact_id order by d.created_at desc limit 1) as stage
    from public.heatmap_clicks c
    where c.created_at >= p_from and c.created_at < p_to
  ),
  clk as (
    select page, section, device, segment, stage, count(*)::bigint as clicks
    from clk_base
    group by page, section, device, segment, stage
  )
  select s.page, s.section, s.segment, s.stage, s.device,
    count(*) filter (where s.reached)::bigint,
    round(avg(s.visible_ms), 0),
    coalesce(max(k.clicks), 0)::bigint
  from secs s
  left join clk k
    on k.page = s.page and k.section = s.section and k.device = s.device
   and k.segment = s.segment and k.stage is not distinct from s.stage
  group by s.page, s.section, s.segment, s.stage, s.device;
$$;
