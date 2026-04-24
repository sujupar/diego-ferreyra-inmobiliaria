-- Sistema de notificaciones transaccionales por email (Resend + inmodf.com.ar)
--
-- Dos tablas:
--   notification_settings: config global (modo prueba, flags de alerta).
--   email_notifications_log: auditoría de cada envío.
--
-- Política RLS: ambas tablas solo se leen/escriben con service role desde lib/email/*.
-- No hay SELECT público.

-- =====================================================================
-- notification_settings: singleton (id='default')
-- =====================================================================
create table if not exists public.notification_settings (
  id text primary key default 'default',
  test_mode_enabled boolean not null default false,
  test_recipient_email text,
  alert_admins_on_lawyer_failure boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id)
  values ('default')
  on conflict (id) do nothing;

alter table public.notification_settings enable row level security;

-- Explicit deny for anon/authenticated. All legitimate access goes through
-- the service role (lib/email/settings.ts). A restrictive policy that evaluates
-- to false on USING is the explicit way to lock down accidental client reads.
create policy "notification_settings_deny_non_service"
  on public.notification_settings
  as restrictive
  for all
  using (false)
  with check (false);

-- =====================================================================
-- email_notifications_log: un registro por envío (1 destinatario = 1 registro)
-- =====================================================================
create table if not exists public.email_notifications_log (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,              -- 'deal_created_advisor' | 'visit_completed' | ...
  recipient_email text not null,                -- destinatario real (puede ser el test recipient)
  original_recipient_email text,                -- destinatario previsto si no hubiera test mode
  subject text not null,
  entity_type text,                             -- 'deal' | 'property' | 'appraisal' | 'user'
  entity_id text,                               -- dealId / propertyId / appraisalId / userId (con sufijo si aplica)
  status text not null,                         -- 'sent' | 'failed' | 'skipped_idempotent'
  error_message text,
  test_mode boolean not null default false,
  resend_email_id text,                         -- ID de Resend (para auditoría/reenvío)
  sent_at timestamptz not null default now()
);

create index if not exists idx_email_log_entity
  on public.email_notifications_log(entity_type, entity_id);

create index if not exists idx_email_log_type_sent
  on public.email_notifications_log(notification_type, sent_at desc);

-- Idempotencia por destinatario: permite reintentar destinatarios que fallaron
-- sin duplicar los que ya recibieron. Incluye recipient_email en la clave para
-- que un fallo parcial pueda repararse (fix del Review #1, crítico #1).
-- Tipos repetibles por ciclo (doc_rejected, docs_resubmitted, docs_ready_for_lawyer)
-- incluyen un sufijo en entity_id para evitar bloquear ciclos legítimos.
create unique index if not exists idx_email_log_idempotency
  on public.email_notifications_log(notification_type, entity_id, recipient_email)
  where status = 'sent' and entity_id is not null;

alter table public.email_notifications_log enable row level security;

-- Same deny-all-non-service pattern as notification_settings. Admin access to
-- the history goes through /api/settings/notifications/history which uses the
-- service role internally.
create policy "email_notifications_log_deny_non_service"
  on public.email_notifications_log
  as restrictive
  for all
  using (false)
  with check (false);
