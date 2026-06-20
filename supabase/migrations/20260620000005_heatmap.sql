-- Mapa de calor INTERNO de las landings (sin apps externas). Aditiva.
-- Mide, por sección de la landing: scroll funnel, tiempo/atención, clics (con
-- posición relativa a la sección → responsive-robusto). Segmentable por anon_id
-- (registrado/no) + etapa + dispositivo. Correr en el SQL Editor del Dashboard.

-- =====================================================================
-- 1) Estado de sesión por (visitante, página): scroll + dispositivo.
-- =====================================================================
create table if not exists public.heatmap_session_state (
  id             uuid primary key default gen_random_uuid(),
  anon_id        text not null,
  contact_id     uuid references public.contacts(id) on delete set null,
  page           text not null,                 -- 'tasacion' | 'clase'
  device         text,                          -- 'mobile' | 'tablet' | 'desktop'
  max_scroll_pct smallint not null default 0,   -- 0..100
  funnel         text,
  first_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (anon_id, page)
);
create index if not exists idx_hm_sess_page on public.heatmap_session_state (page, updated_at);
alter table public.heatmap_session_state enable row level security;

-- 2) Estado por (visitante, página, sección): llegó + tiempo visible.
create table if not exists public.heatmap_section_state (
  id          uuid primary key default gen_random_uuid(),
  anon_id     text not null,
  contact_id  uuid references public.contacts(id) on delete set null,
  page        text not null,
  section     text not null,
  reached     boolean not null default false,
  visible_ms  numeric(10,0) not null default 0,
  updated_at  timestamptz not null default now(),
  unique (anon_id, page, section)
);
create index if not exists idx_hm_secstate_page on public.heatmap_section_state (page, section);
alter table public.heatmap_section_state enable row level security;

-- 3) Clics individuales (pocos por sesión), idempotentes por seq.
create table if not exists public.heatmap_clicks (
  id          uuid primary key default gen_random_uuid(),
  anon_id     text not null,
  contact_id  uuid references public.contacts(id) on delete set null,
  page        text not null,
  seq         int not null,                     -- índice del clic en la sesión (dedup)
  device      text,
  section     text,
  x_pct       numeric(5,2),                     -- 0..100 dentro de la sección
  y_pct       numeric(5,2),
  tag         text,                             -- 'button'|'a'|'video'|'other'
  rage        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (anon_id, page, seq)
);
create index if not exists idx_hm_clicks_page on public.heatmap_clicks (page, device, created_at);
alter table public.heatmap_clicks enable row level security;

-- =====================================================================
-- 4) Ingesta: upsert idempotente de scroll + secciones + clics (1 RPC).
-- =====================================================================
create or replace function public.track_heatmap(
  p_anon       text,
  p_page       text,
  p_device     text,
  p_funnel     text,
  p_max_scroll smallint,
  p_sections   jsonb,   -- [{key,reached,ms}]
  p_clicks     jsonb    -- [{seq,section,xPct,yPct,tag,rage}]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  s jsonb;
  c jsonb;
begin
  select contact_id into v_contact from public.anon_identity where anon_id = p_anon;

  insert into public.heatmap_session_state(anon_id, page, device, max_scroll_pct, funnel, contact_id)
  values (p_anon, p_page, p_device, coalesce(p_max_scroll, 0), p_funnel, v_contact)
  on conflict (anon_id, page) do update set
    max_scroll_pct = greatest(heatmap_session_state.max_scroll_pct, excluded.max_scroll_pct),
    device         = coalesce(excluded.device, heatmap_session_state.device),
    funnel         = coalesce(excluded.funnel, heatmap_session_state.funnel),
    contact_id     = coalesce(heatmap_session_state.contact_id, excluded.contact_id),
    updated_at     = now();

  if p_sections is not null then
    for s in select * from jsonb_array_elements(p_sections) loop
      insert into public.heatmap_section_state(anon_id, page, section, reached, visible_ms, contact_id)
      values (p_anon, p_page, s->>'key', coalesce((s->>'reached')::boolean, false),
              coalesce((s->>'ms')::numeric, 0), v_contact)
      on conflict (anon_id, page, section) do update set
        reached    = heatmap_section_state.reached or excluded.reached,
        visible_ms = greatest(heatmap_section_state.visible_ms, excluded.visible_ms),
        contact_id = coalesce(heatmap_section_state.contact_id, excluded.contact_id),
        updated_at = now();
    end loop;
  end if;

  if p_clicks is not null then
    for c in select * from jsonb_array_elements(p_clicks) loop
      insert into public.heatmap_clicks(anon_id, page, seq, device, section, x_pct, y_pct, tag, rage, contact_id)
      values (p_anon, p_page, (c->>'seq')::int, p_device, c->>'section',
              (c->>'xPct')::numeric, (c->>'yPct')::numeric, c->>'tag',
              coalesce((c->>'rage')::boolean, false), v_contact)
      on conflict (anon_id, page, seq) do nothing;
    end loop;
  end if;
end;
$$;

-- =====================================================================
-- 5) Stitching: extender link_anon_to_contact para back-fillear el heatmap.
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

  update public.video_view_state    set contact_id = p_contact_id where anon_id = p_anon_id and contact_id is null;
  update public.heatmap_session_state set contact_id = p_contact_id where anon_id = p_anon_id and contact_id is null;
  update public.heatmap_section_state set contact_id = p_contact_id where anon_id = p_anon_id and contact_id is null;
  update public.heatmap_clicks       set contact_id = p_contact_id where anon_id = p_anon_id and contact_id is null;
end;
$$;

-- =====================================================================
-- 6) Agregación para el panel.
-- =====================================================================
-- Totales de sesión por (page, segment, stage, device) → denominador + scroll medio.
create or replace function public.heatmap_session_totals(p_from timestamptz, p_to timestamptz)
returns table (page text, segment text, stage text, device text, sessions bigint, avg_scroll numeric)
language sql stable security definer set search_path = public as $$
  with base as (
    select s.page,
      case when s.contact_id is null then 'no_registrado' else 'registrado' end as segment,
      (select d.stage from public.deals d where d.contact_id = s.contact_id order by d.created_at desc limit 1) as stage,
      coalesce(s.device, 'desktop') as device, s.max_scroll_pct
    from public.heatmap_session_state s
    where s.updated_at >= p_from and s.updated_at < p_to
  )
  select page, segment, stage, device, count(*)::bigint, round(avg(max_scroll_pct), 1)
  from base group by page, segment, stage, device;
$$;

-- Por sección: llegó + tiempo medio + clics.
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
  clk as (
    select page, section, coalesce(device,'desktop') as device,
      case when contact_id is null then 'no_registrado' else 'registrado' end as segment,
      count(*)::bigint as clicks
    from public.heatmap_clicks
    where created_at >= p_from and created_at < p_to
    group by page, section, device, case when contact_id is null then 'no_registrado' else 'registrado' end
  )
  select s.page, s.section, s.segment, s.stage, s.device,
    count(*) filter (where s.reached)::bigint,
    round(avg(s.visible_ms), 0),
    coalesce(max(k.clicks), 0)::bigint
  from secs s
  left join clk k on k.page = s.page and k.section = s.section and k.device = s.device and k.segment = s.segment
  group by s.page, s.section, s.segment, s.stage, s.device;
$$;

-- Grilla de densidad de clics (bins de 5% × 5%) para el overlay v2.
create or replace function public.heatmap_clicks_grid(p_from timestamptz, p_to timestamptz)
returns table (page text, section text, segment text, device text, x_bin int, y_bin int, clicks bigint, rage bigint)
language sql stable security definer set search_path = public as $$
  select page, section,
    case when contact_id is null then 'no_registrado' else 'registrado' end as segment,
    coalesce(device, 'desktop') as device,
    least(19, floor(x_pct / 5))::int as x_bin,
    least(19, floor(y_pct / 5))::int as y_bin,
    count(*)::bigint,
    count(*) filter (where rage)::bigint
  from public.heatmap_clicks
  where created_at >= p_from and created_at < p_to and x_pct is not null and y_pct is not null
  group by page, section, case when contact_id is null then 'no_registrado' else 'registrado' end,
           coalesce(device,'desktop'), least(19, floor(x_pct / 5)), least(19, floor(y_pct / 5));
$$;
