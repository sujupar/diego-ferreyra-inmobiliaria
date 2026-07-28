-- Auditoría de métricas de video/campañas (2026-07-28). TODO ADITIVO.
-- Correr en el SQL Editor del Dashboard.
--
-- Qué arregla:
--  1) Tasa de reproducción: distingue INTENTO de play (click) de playback EFECTIVO.
--     Con el bug de autoplay bloqueado en mobile, muchos clicks no producían vista
--     y quedaban invisibles. Ahora se miden ambos.
--  2) Segmento registrado/no: se resuelve también vía anon_identity (defensa por si
--     el back-fill del stitching no corrió para alguna fila).
--  3) Campañas: los macros de Meta sin sustituir ({{campaign.name}}) se normalizan
--     a NULL para que no aparezcan como si fueran una campaña real.

-- =====================================================================
-- 1) Nuevas métricas de reproducción en video_view_state
-- =====================================================================
alter table public.video_view_state
  add column if not exists play_intents    smallint not null default 0,
  add column if not exists playback_started boolean  not null default false;

-- Las filas históricas con visionado real obviamente arrancaron.
update public.video_view_state
   set playback_started = true, play_intents = greatest(play_intents, 1)
 where watch_seconds > 0 and playback_started = false;

-- =====================================================================
-- 2) upsert_video_view + intentos/playback (params con DEFAULT → el código
--    deployado anterior sigue funcionando sin cambios durante el deploy).
-- =====================================================================
drop function if exists public.upsert_video_view(
  text, text, text, text, numeric, numeric, smallint, smallint, boolean, text, text, varbit
);

create or replace function public.upsert_video_view(
  p_anon_id          text,
  p_video_key        text,
  p_context          text,
  p_page_path        text,
  p_duration         numeric,
  p_watch_seconds    numeric,
  p_max_percent      smallint,
  p_quartiles        smallint,
  p_completed        boolean,
  p_funnel           text,
  p_fbp              text,
  p_watched_buckets  varbit   default null,
  p_play_intents     smallint default 0,
  p_playback_started boolean  default false
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.video_view_state
    (anon_id, video_key, context, page_path, duration_s, watch_seconds,
     max_percent, quartiles, completed, funnel, fbp, watched_buckets,
     play_intents, playback_started, contact_id)
  values
    (p_anon_id, p_video_key, p_context, p_page_path, p_duration,
     coalesce(p_watch_seconds, 0), coalesce(p_max_percent, 0),
     coalesce(p_quartiles, 0), coalesce(p_completed, false), p_funnel, p_fbp,
     p_watched_buckets, coalesce(p_play_intents, 0), coalesce(p_playback_started, false),
     (select contact_id from public.anon_identity where anon_id = p_anon_id))
  on conflict (anon_id, video_key) do update set
    watch_seconds    = greatest(video_view_state.watch_seconds, excluded.watch_seconds),
    max_percent      = greatest(video_view_state.max_percent,   excluded.max_percent),
    quartiles        = video_view_state.quartiles | excluded.quartiles,
    completed        = video_view_state.completed or excluded.completed,
    play_intents     = greatest(video_view_state.play_intents, excluded.play_intents),
    playback_started = video_view_state.playback_started or excluded.playback_started,
    duration_s       = coalesce(excluded.duration_s, video_view_state.duration_s),
    contact_id       = coalesce(video_view_state.contact_id, excluded.contact_id),
    page_path        = coalesce(excluded.page_path, video_view_state.page_path),
    context          = coalesce(excluded.context, video_view_state.context),
    funnel           = coalesce(excluded.funnel, video_view_state.funnel),
    fbp              = coalesce(excluded.fbp, video_view_state.fbp),
    watched_buckets  = case
                         when video_view_state.watched_buckets is null then excluded.watched_buckets
                         when excluded.watched_buckets is null then video_view_state.watched_buckets
                         else video_view_state.watched_buckets | excluded.watched_buckets
                       end,
    updated_at       = now();
$$;

-- =====================================================================
-- 3) funnel_video_stats: + intentos/reproducciones y segmento robusto.
--    Cambia el RETURNS TABLE → DROP + CREATE (regla del proyecto).
-- =====================================================================
drop function if exists public.funnel_video_stats(timestamptz, timestamptz);

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
  q25 bigint, q50 bigint, q75 bigint, q95 bigint, q100 bigint,
  play_intents    bigint,   -- personas que TOCARON reproducir
  plays_started   bigint    -- de esas, en cuántas arrancó el video de verdad
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
      v.play_intents, v.playback_started,
      -- Segmento robusto: contact_id propio o el del puente anon_identity.
      case when coalesce(v.contact_id, ai.contact_id) is null
           then 'no_registrado' else 'registrado' end       as segment,
      (select d.stage from public.deals d
        where d.contact_id = coalesce(v.contact_id, ai.contact_id)
        order by d.created_at desc limit 1)                 as stage
    from public.video_view_state v
    left join public.anon_identity ai on ai.anon_id = v.anon_id
    where v.updated_at >= p_from and v.updated_at < p_to
      and (v.watch_seconds > 0 or v.play_intents > 0)
  )
  select
    funnel, video_key, segment, stage,
    count(*) filter (where watch_seconds > 0)::bigint,       -- vistas = visionado real
    round(avg(max_percent)   filter (where watch_seconds > 0), 1),
    round(avg(case when duration_s > 0 then 100 * watch_seconds / duration_s end)
          filter (where watch_seconds > 0), 1),
    count(*) filter (where completed)::bigint,
    count(*) filter (where quartiles & 1  > 0)::bigint,
    count(*) filter (where quartiles & 2  > 0)::bigint,
    count(*) filter (where quartiles & 4  > 0)::bigint,
    count(*) filter (where quartiles & 8  > 0)::bigint,
    count(*) filter (where quartiles & 16 > 0)::bigint,
    count(*) filter (where play_intents > 0)::bigint,
    count(*) filter (where playback_started)::bigint
  from base
  group by funnel, video_key, segment, stage;
$$;

-- =====================================================================
-- 4) Mismo segmento robusto para retención y heatmap del video.
-- =====================================================================
create or replace function public.funnel_video_retention(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel text, video_key text, segment text, stage text, percent int, viewers bigint)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      coalesce(v.funnel, 'otro') as funnel, v.video_key, v.max_percent,
      case when coalesce(v.contact_id, ai.contact_id) is null
           then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d
        where d.contact_id = coalesce(v.contact_id, ai.contact_id)
        order by d.created_at desc limit 1) as stage
    from public.video_view_state v
    left join public.anon_identity ai on ai.anon_id = v.anon_id
    where v.updated_at >= p_from and v.updated_at < p_to and v.watch_seconds > 0
  )
  select funnel, video_key, segment, stage, max_percent::int, count(*)::bigint
  from base group by funnel, video_key, segment, stage, max_percent;
$$;

create or replace function public.funnel_video_heatmap(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel text, video_key text, segment text, stage text, bucket int, viewers bigint)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      coalesce(v.funnel, 'otro') as funnel, v.video_key,
      case when coalesce(v.contact_id, ai.contact_id) is null
           then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d
        where d.contact_id = coalesce(v.contact_id, ai.contact_id)
        order by d.created_at desc limit 1) as stage,
      v.watched_buckets
    from public.video_view_state v
    left join public.anon_identity ai on ai.anon_id = v.anon_id
    where v.updated_at >= p_from and v.updated_at < p_to
      and v.watch_seconds > 0 and v.watched_buckets is not null
  )
  select funnel, video_key, segment, stage, b as bucket,
    count(*) filter (where get_bit(watched_buckets, b) = 1)::bigint as viewers
  from base, generate_series(0, 99) as b
  group by funnel, video_key, segment, stage, b;
$$;

-- =====================================================================
-- 5) CAMPAÑAS: normalizar los macros de Meta sin sustituir ({{...}}).
--    Ese anuncio (publicación impulsada) no reemplaza el macro y ensuciaba
--    la tabla "Por campaña" como si fuese una campaña real.
-- =====================================================================
update public.landing_page_visits
   set utm_campaign = null
 where utm_campaign like '{{%}}';
update public.landing_page_visits
   set utm_source = null
 where utm_source like '{{%}}';
update public.landing_page_visits
   set utm_medium = null
 where utm_medium like '{{%}}';
update public.landing_page_visits
   set utm_content = null
 where utm_content like '{{%}}';
update public.landing_page_visits
   set utm_term = null
 where utm_term like '{{%}}';

update public.deals
   set meta_campaign_name = null
 where meta_campaign_name like '{{%}}';
update public.deals
   set meta_adset_name = null
 where meta_adset_name like '{{%}}';
update public.deals
   set meta_ad_name = null
 where meta_ad_name like '{{%}}';

-- Etiqueta legible para las visitas/conversiones sin campaña identificada.
create or replace function public.funnel_campaign_visits(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel_type text, campaign text, visits bigint)
language sql stable security definer set search_path = public as $$
  select
    funnel_type,
    case
      when utm_campaign is null or utm_campaign = '' or utm_campaign like '{{%}}'
        then '(sin campaña identificada)'
      else utm_campaign
    end as campaign,
    count(*)::bigint
  from public.landing_page_visits
  where visited_at >= p_from and visited_at < p_to
  group by funnel_type, 2;
$$;

create or replace function public.funnel_campaign_conversions(
  p_from timestamptz,
  p_to   timestamptz
) returns table (funnel text, campaign text, conversions bigint)
language sql stable security definer set search_path = public as $$
  select
    s.funnel,
    case
      when d.meta_campaign_name is null or d.meta_campaign_name = ''
           or d.meta_campaign_name like '{{%}}'
        then '(sin campaña identificada)'
      else d.meta_campaign_name
    end as campaign,
    count(*)::bigint
  from public.funnel_lead_submissions s
  join public.deals d on d.id = s.deal_id
  where s.created_at >= p_from and s.created_at < p_to
  group by s.funnel, 2;
$$;
