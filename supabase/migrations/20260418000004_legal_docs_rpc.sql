-- Atomic merge RPC for legal_docs to avoid race conditions on concurrent uploads/reviews.
CREATE OR REPLACE FUNCTION merge_property_legal_doc(
  p_property_id UUID,
  p_item_key TEXT,
  p_item_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merged JSONB;
BEGIN
  UPDATE properties
  SET legal_docs = COALESCE(legal_docs, '{}'::jsonb)
                || jsonb_build_object(
                     p_item_key,
                     COALESCE(legal_docs->p_item_key, '{}'::jsonb) || p_item_patch
                   ),
      updated_at = now()
  WHERE id = p_property_id
  RETURNING legal_docs INTO v_merged;
  RETURN v_merged;
END;
$$;

-- Analogous atomic merge for legal_flags.
CREATE OR REPLACE FUNCTION merge_property_legal_flags(
  p_property_id UUID,
  p_flags_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merged JSONB;
BEGIN
  UPDATE properties
  SET legal_flags = COALESCE(legal_flags, '{}'::jsonb) || p_flags_patch,
      updated_at = now()
  WHERE id = p_property_id
  RETURNING legal_flags INTO v_merged;
  RETURN v_merged;
END;
$$;
