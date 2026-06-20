-- Fase 4 — RPCs de agregación para el panel Embudos detallado.
-- Aditiva (solo funciones). Correr en el SQL Editor del Dashboard.

-- =====================================================================
-- 1) Analítica de video por (funnel, video_key, segmento, etapa del deal).
--    Segmento: no_registrado (sin contact_id) vs registrado.
--    Etapa: stage del deal más reciente del contacto (para filtrar/correlacionar
--    "los captados vieron el 80%"). Solo cuenta visionado real (watch_seconds>0).
-- =====================================================================
create or replace function public.funnel_video_stats(
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  funnel          text,
  video_key       text,
  segment         text,
  stage           text,
  viewers         bigint,
  avg_max_percent numeric,
  avg_attention   numeric,
  completed       bigint,
  q25 bigint, q50 bigint, q75 bigint, q95 bigint, q100 bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      coalesce(v.funnel, 'otro')                            as funnel,
      v.video_key,
      v.max_percent, v.watch_seconds, v.duration_s, v.completed, v.quartiles,
      case when v.contact_id is null then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d
        where d.contact_id = v.contact_id
        order by d.created_at desc limit 1)                 as stage
    from public.video_view_state v
    where v.updated_at >= p_from and v.updated_at < p_to
      and v.watch_seconds > 0
  )
  select
    funnel, video_key, segment, stage,
    count(*)::bigint,
    round(avg(max_percent), 1),
    round(avg(case when duration_s > 0 then 100 * watch_seconds / duration_s end), 1),
    count(*) filter (where completed)::bigint,
    count(*) filter (where quartiles & 1  > 0)::bigint,
    count(*) filter (where quartiles & 2  > 0)::bigint,
    count(*) filter (where quartiles & 4  > 0)::bigint,
    count(*) filter (where quartiles & 8  > 0)::bigint,
    count(*) filter (where quartiles & 16 > 0)::bigint
  from base
  group by funnel, video_key, segment, stage;
$$;

-- =====================================================================
-- 2) Visitas por campaña (landing_page_visits.utm_campaign).
-- =====================================================================
create or replace function public.funnel_campaign_visits(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel_type text, campaign text, visits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    funnel_type,
    coalesce(nullif(utm_campaign, ''), '(directo)') as campaign,
    count(*)::bigint
  from public.landing_page_visits
  where visited_at >= p_from and visited_at < p_to
  group by funnel_type, coalesce(nullif(utm_campaign, ''), '(directo)');
$$;

-- =====================================================================
-- 3) Conversiones por campaña (deals.meta_campaign_name vía submission).
-- =====================================================================
create or replace function public.funnel_campaign_conversions(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel text, campaign text, conversions bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.funnel,
    coalesce(nullif(d.meta_campaign_name, ''), '(directo)') as campaign,
    count(*)::bigint
  from public.funnel_lead_submissions s
  join public.deals d on d.id = s.deal_id
  where s.created_at >= p_from and s.created_at < p_to
  group by s.funnel, coalesce(nullif(d.meta_campaign_name, ''), '(directo)');
$$;
