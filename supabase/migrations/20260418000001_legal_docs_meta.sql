-- supabase/migrations/20260418000001_legal_docs_meta.sql
-- Reemplaza el array plano `documents` por metadata por-ítem del checklist legal.
-- Mantiene `documents` por compatibilidad durante la transición.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS legal_docs JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_flags JSONB DEFAULT '{
    "has_succession": false,
    "has_divorce": false,
    "has_powers": false,
    "is_credit_purchase": false
  }'::jsonb;

COMMENT ON COLUMN properties.legal_docs IS 'Checklist legal: { [item_key]: { file_url, file_name, uploaded_at, status: "pending"|"approved"|"rejected", reviewer_notes, reviewed_at, reviewed_by } }';
COMMENT ON COLUMN properties.legal_flags IS 'Flags condicionales: succession, divorce, powers, credit_purchase';

CREATE INDEX IF NOT EXISTS idx_properties_legal_docs ON properties USING gin (legal_docs);
