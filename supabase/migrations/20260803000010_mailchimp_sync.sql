-- supabase/migrations/20260803000010_mailchimp_sync.sql
-- ADITIVA: 3 tablas nuevas para la sync CRM ↔ Mailchimp. No toca deals/contacts.

-- Ledger: último tag sincronizado por deal (fuente de la reconciliación).
create table if not exists public.mailchimp_sync_state (
  deal_id    uuid primary key references public.deals(id) on delete cascade,
  last_tag   text,
  last_email text,
  synced_at  timestamptz not null default now()
);

-- Log append-only: observabilidad de cada intento de sync.
create table if not exists public.mailchimp_sync_log (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid,
  email       text,
  tag_applied text,
  status      text not null, -- synced | skipped_disabled | skipped_no_email | suppressed | failed
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists mailchimp_sync_log_deal_idx    on public.mailchimp_sync_log(deal_id);
create index if not exists mailchimp_sync_log_created_idx  on public.mailchimp_sync_log(created_at desc);

-- Supresiones: bajas/rebotes espejados desde Mailchimp (el sync los saltea).
create table if not exists public.mailchimp_suppressions (
  email      text primary key,
  reason     text not null, -- unsubscribe | cleaned
  created_at timestamptz not null default now()
);

-- RLS: habilitada sin políticas → solo el service role (que la bypassa) accede.
-- Consistente con la postura RLS del proyecto; no hay UI que las lea todavía.
alter table public.mailchimp_sync_state   enable row level security;
alter table public.mailchimp_sync_log     enable row level security;
alter table public.mailchimp_suppressions enable row level security;
