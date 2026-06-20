-- Fase 3 — Atribución UTM Meta → CRM (campaña / conjunto / anuncio).
-- Aditiva. NO toca dedup, captura de leads, conversiones Meta ni el trigger
-- AFTER deal_stage_history (estas columnas son inertes para ese trigger).
-- Correr en el SQL Editor del Dashboard.

-- IDs estables de Meta en la visita (para análisis por campaña en Embudos).
alter table public.landing_page_visits
  add column if not exists fb_campaign_id text,
  add column if not exists fb_adset_id    text,
  add column if not exists fb_ad_id       text,
  add column if not exists fb_placement   text;

-- Atribución en el deal (lo que el asesor ve al abrir la solicitud).
-- Columnas dedicadas (nombres legibles + IDs) + blob crudo de respaldo.
alter table public.deals
  add column if not exists meta_campaign_id   text,
  add column if not exists meta_campaign_name text,
  add column if not exists meta_adset_id      text,
  add column if not exists meta_adset_name    text,
  add column if not exists meta_ad_id         text,
  add column if not exists meta_ad_name       text,
  add column if not exists meta_placement     text,
  add column if not exists meta_site_source   text,
  add column if not exists origin_metadata    jsonb;

create index if not exists idx_deals_meta_campaign on public.deals (meta_campaign_id);
