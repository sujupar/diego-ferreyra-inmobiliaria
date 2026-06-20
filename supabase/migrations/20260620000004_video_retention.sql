-- Optimización analítica de video: retención DETALLADA (v1 profundidad + v2 momento a momento).
-- Aditiva. Correr en el SQL Editor del Dashboard.

-- =====================================================================
-- 1) Bitmap de tramos vistos: 100 buckets (1% del video c/u). bit 0 = inicio.
--    Permite la curva de retención "momento a momento" (qué % ve cada tramo,
--    detecta saltos/re-vistas), no solo el punto más lejano alcanzado.
-- =====================================================================
alter table public.video_view_state add column if not exists watched_buckets varbit;

-- =====================================================================
-- 2) upsert_video_view + p_watched_buckets (OR-merge idempotente del bitmap).
--    Cambia la firma → DROP + CREATE (regla del proyecto para funciones).
-- =====================================================================
drop function if exists public.upsert_video_view(
  text, text, text, text, numeric, numeric, smallint, smallint, boolean, text, text
);

create or replace function public.upsert_video_view(
  p_anon_id        text,
  p_video_key      text,
  p_context        text,
  p_page_path      text,
  p_duration       numeric,
  p_watch_seconds  numeric,
  p_max_percent    smallint,
  p_quartiles      smallint,
  p_completed      boolean,
  p_funnel         text,
  p_fbp            text,
  p_watched_buckets varbit default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.video_view_state
    (anon_id, video_key, context, page_path, duration_s, watch_seconds,
     max_percent, quartiles, completed, funnel, fbp, watched_buckets, contact_id)
  values
    (p_anon_id, p_video_key, p_context, p_page_path, p_duration,
     coalesce(p_watch_seconds, 0), coalesce(p_max_percent, 0),
     coalesce(p_quartiles, 0), coalesce(p_completed, false), p_funnel, p_fbp,
     p_watched_buckets,
     (select contact_id from public.anon_identity where anon_id = p_anon_id))
  on conflict (anon_id, video_key) do update set
    watch_seconds   = greatest(video_view_state.watch_seconds, excluded.watch_seconds),
    max_percent     = greatest(video_view_state.max_percent,   excluded.max_percent),
    quartiles       = video_view_state.quartiles | excluded.quartiles,
    completed       = video_view_state.completed or excluded.completed,
    duration_s      = coalesce(excluded.duration_s, video_view_state.duration_s),
    contact_id      = coalesce(video_view_state.contact_id, excluded.contact_id),
    page_path       = coalesce(excluded.page_path, video_view_state.page_path),
    context         = coalesce(excluded.context, video_view_state.context),
    funnel          = coalesce(excluded.funnel, video_view_state.funnel),
    fbp             = coalesce(excluded.fbp, video_view_state.fbp),
    watched_buckets = case
                        when video_view_state.watched_buckets is null then excluded.watched_buckets
                        when excluded.watched_buckets is null then video_view_state.watched_buckets
                        else video_view_state.watched_buckets | excluded.watched_buckets
                      end,
    updated_at      = now();
$$;

-- =====================================================================
-- 3) v1 — Histograma de PROFUNDIDAD (max_percent): dónde dejó de ver cada uno.
-- =====================================================================
create or replace function public.funnel_video_retention(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel text, video_key text, segment text, stage text, percent int, viewers bigint)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      coalesce(v.funnel, 'otro') as funnel,
      v.video_key,
      v.max_percent,
      case when v.contact_id is null then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d
        where d.contact_id = v.contact_id order by d.created_at desc limit 1) as stage
    from public.video_view_state v
    where v.updated_at >= p_from and v.updated_at < p_to and v.watch_seconds > 0
  )
  select funnel, video_key, segment, stage, max_percent::int, count(*)::bigint
  from base
  group by funnel, video_key, segment, stage, max_percent;
$$;

-- =====================================================================
-- 4) v2 — Retención MOMENTO A MOMENTO: por cada bucket (0..99 = 0%..99% del
--    video), cuántos espectadores vieron ese tramo. Curva estilo YouTube.
-- =====================================================================
create or replace function public.funnel_video_heatmap(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel text, video_key text, segment text, stage text, bucket int, viewers bigint)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      coalesce(v.funnel, 'otro') as funnel,
      v.video_key,
      case when v.contact_id is null then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d
        where d.contact_id = v.contact_id order by d.created_at desc limit 1) as stage,
      v.watched_buckets
    from public.video_view_state v
    where v.updated_at >= p_from and v.updated_at < p_to
      and v.watch_seconds > 0 and v.watched_buckets is not null
  )
  select funnel, video_key, segment, stage, b as bucket,
    count(*) filter (where get_bit(watched_buckets, b) = 1)::bigint as viewers
  from base, generate_series(0, 99) as b
  group by funnel, video_key, segment, stage, b;
$$;
