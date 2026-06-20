-- Fase 2 — Analítica de % de video visto (anónimo + registrado).
-- Aditiva. NO toca captura de leads, conversiones Meta, CRM ni métricas.
-- Correr en el SQL Editor del Dashboard (el CLI no conecta).

-- =====================================================================
-- 1) Estado por (visitante, video) — UPSERT idempotente, una fila por par.
-- =====================================================================
create table if not exists public.video_view_state (
  id            uuid primary key default gen_random_uuid(),
  anon_id       text not null,                       -- UUID propio (cookie df_anon)
  contact_id    uuid references public.contacts(id) on delete set null,
  video_key     text not null,                       -- slug estable: 'hero-tasacion', 'clase-completa'
  context       text,                                -- 'hero' | 'clase'
  page_path     text,
  duration_s    numeric(8,2),
  watch_seconds numeric(8,2) not null default 0,     -- atención real (segundos únicos)
  max_percent   smallint     not null default 0,     -- 0..100 profundidad
  quartiles     smallint     not null default 0,     -- BITMAP 1=25 2=50 4=75 8=95 16=100
  completed     boolean      not null default false,
  funnel        text,                                -- 'tasacion' | 'clase'
  fbp           text,
  first_at      timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  unique (anon_id, video_key)                        -- OBLIGATORIA: habilita el upsert sin duplicar
);
create index if not exists idx_vvs_video_updated on public.video_view_state (video_key, updated_at);
create index if not exists idx_vvs_contact       on public.video_view_state (contact_id);

-- RLS ON sin policies permisivas: solo el service-role (endpoints server-side)
-- escribe y lee. No se expone INSERT/SELECT a anon ni authenticated.
alter table public.video_view_state enable row level security;

-- =====================================================================
-- 2) Puente anónimo → contacto (multi-dispositivo / stitching).
-- =====================================================================
create table if not exists public.anon_identity (
  anon_id       text primary key,
  contact_id    uuid references public.contacts(id) on delete set null,
  first_seen    timestamptz not null default now(),
  identified_at timestamptz
);
alter table public.anon_identity enable row level security;

-- =====================================================================
-- 3) UPSERT del progreso: toma SIEMPRE el máximo (nunca regresa).
-- =====================================================================
create or replace function public.upsert_video_view(
  p_anon_id       text,
  p_video_key     text,
  p_context       text,
  p_page_path     text,
  p_duration      numeric,
  p_watch_seconds numeric,
  p_max_percent   smallint,
  p_quartiles     smallint,
  p_completed     boolean,
  p_funnel        text,
  p_fbp           text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.video_view_state
    (anon_id, video_key, context, page_path, duration_s, watch_seconds,
     max_percent, quartiles, completed, funnel, fbp, contact_id)
  values
    (p_anon_id, p_video_key, p_context, p_page_path, p_duration,
     coalesce(p_watch_seconds, 0), coalesce(p_max_percent, 0),
     coalesce(p_quartiles, 0), coalesce(p_completed, false), p_funnel, p_fbp,
     (select contact_id from public.anon_identity where anon_id = p_anon_id))
  on conflict (anon_id, video_key) do update set
    watch_seconds = greatest(video_view_state.watch_seconds, excluded.watch_seconds),
    max_percent   = greatest(video_view_state.max_percent,   excluded.max_percent),
    quartiles     = video_view_state.quartiles | excluded.quartiles,
    completed     = video_view_state.completed or excluded.completed,
    duration_s    = coalesce(excluded.duration_s, video_view_state.duration_s),
    contact_id    = coalesce(video_view_state.contact_id, excluded.contact_id),
    page_path     = coalesce(excluded.page_path, video_view_state.page_path),
    context       = coalesce(excluded.context, video_view_state.context),
    funnel        = coalesce(excluded.funnel, video_view_state.funnel),
    fbp           = coalesce(excluded.fbp, video_view_state.fbp),
    updated_at    = now();
$$;

-- =====================================================================
-- 4) Stitching: al registrarse, vincular el anon_id al contacto y back-fill.
--    Idempotente: NO pisa una asociación previa (conserva la más antigua).
-- =====================================================================
create or replace function public.link_anon_to_contact(
  p_anon_id    text,
  p_contact_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.anon_identity (anon_id, contact_id, identified_at)
  values (p_anon_id, p_contact_id, now())
  on conflict (anon_id) do update set
    contact_id    = coalesce(anon_identity.contact_id, excluded.contact_id),
    identified_at = coalesce(anon_identity.identified_at, excluded.identified_at);

  update public.video_view_state
     set contact_id = p_contact_id
   where anon_id = p_anon_id and contact_id is null;
end;
$$;
