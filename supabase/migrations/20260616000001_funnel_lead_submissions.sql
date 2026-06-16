-- Log de envíos de los formularios de funnel (tasación / clase).
-- Sirve para: (1) rate-limit por IP, (2) dedup por email/phone, (3) observabilidad,
-- (4) persistir el event_id para deduplicar Pixel+CAPI en Fase 3.
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

create table if not exists public.funnel_lead_submissions (
  id          uuid primary key default gen_random_uuid(),
  funnel      text not null check (funnel in ('tasacion','clase')),
  ip_hash     text,
  email       text,
  phone       text,
  contact_id  uuid references public.contacts(id) on delete set null,
  deal_id     uuid references public.deals(id) on delete set null,
  event_id    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_fls_ip_created    on public.funnel_lead_submissions (ip_hash, created_at desc);
create index if not exists idx_fls_email_created  on public.funnel_lead_submissions (email, created_at desc);
create index if not exists idx_fls_phone_created  on public.funnel_lead_submissions (phone, created_at desc);

-- RLS: sin policies → solo service-role escribe/lee. anon/authenticated denegados.
alter table public.funnel_lead_submissions enable row level security;
