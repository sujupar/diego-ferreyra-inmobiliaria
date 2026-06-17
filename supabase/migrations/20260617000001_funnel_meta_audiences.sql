-- Públicos de Meta por etapa del embudo (sincronización desde el CRM).
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

-- Config: 1 fila por etapa con público (audience_id de Meta).
create table if not exists public.funnel_meta_audiences (
  stage        text primary key,           -- 'clase_gratuita' | 'request' | ... (DEAL_STAGES)
  audience_id  text not null,
  name         text not null,
  exclude_from_prospecting boolean not null default false,  -- captured/lost = true
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Ledger: qué contacto está en qué público (para el diff idempotente add/remove).
create table if not exists public.funnel_meta_audience_members (
  id            bigserial primary key,
  stage         text not null,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  hashed_email  text,
  hashed_phone  text,
  status        text not null default 'active' check (status in ('active','removed')),
  last_synced_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (stage, contact_id)
);
create index if not exists idx_fma_members_stage_status on public.funnel_meta_audience_members (stage, status);

-- Telemetría por corrida.
create table if not exists public.funnel_meta_sync_log (
  id           bigserial primary key,
  run_at       timestamptz not null default now(),
  stage        text,
  added        int default 0,
  removed      int default 0,
  num_received int,
  error        text
);

-- RLS: sin policies → solo service-role (anon/authenticated denegados).
alter table public.funnel_meta_audiences enable row level security;
alter table public.funnel_meta_audience_members enable row level security;
alter table public.funnel_meta_sync_log enable row level security;
