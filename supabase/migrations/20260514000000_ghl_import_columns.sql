-- =============================================================================
-- Migration: columnas para importar y trackear data de GHL
-- Date: 2026-05-14
--
-- CONTEXTO
-- --------
-- Importamos histórico de "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" desde GHL al
-- CRM nuestro (script scripts/ghl-import.ts). Necesitamos:
--   1. Idempotencia: poder re-correr el import sin duplicar (claves únicas
--      por ghl_*_id).
--   2. Tags arbitrarias (Colega, seguimiento_tasacion, etc.) que no son
--      stages pero sirven como filtros.
--   3. Preservar la data cruda del contact de GHL (custom fields que no pudimos
--      mapear a columnas tipadas) para no perder nada.
--   4. Marcar las properties que vinieron del import (banner + task de
--      "completar datos" en UI).
--
-- Idempotente. Pegar en Supabase Dashboard → SQL Editor → Run.
-- =============================================================================

-- ── DEALS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS tags TEXT[];

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS deals_ghl_opportunity_id_key
  ON public.deals (ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_tags_gin
  ON public.deals USING GIN (tags);

-- Comentario informativo (deals.stage es TEXT libre, no requiere ALTER de tipo)
COMMENT ON COLUMN public.deals.stage IS
  'CRM stage. Valores válidos: clase_gratuita, request, scheduled, not_visited, '
  'visited, appraisal_sent, followup, captured, lost, comprador.';

-- ── CONTACTS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS tags TEXT[];

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_ghl_contact_id_key
  ON public.contacts (ghl_contact_id)
  WHERE ghl_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_tags_gin
  ON public.contacts USING GIN (tags);

-- ── PROPERTIES ───────────────────────────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ghl_imported BOOLEAN DEFAULT FALSE;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ghl_custom_fields JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS properties_ghl_opportunity_id_key
  ON public.properties (ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS properties_ghl_imported_idx
  ON public.properties (ghl_imported)
  WHERE ghl_imported = TRUE;
