-- =============================================================================
-- Alinear el CHECK de properties.status con la app: agregar 'descartada'
-- =============================================================================
-- La app descarta propiedades con `status = 'descartada'` (PUT /api/properties/[id],
-- ver comentario en app/api/properties/[id]/route.ts), pero el CHECK original de la
-- tabla (creada fuera de migraciones) NO incluye ese valor: cualquier descarte
-- falla con 23514 (check_violation). Detectado 2026-07-13 al archivar las fichas
-- duplicadas de la fusión — el botón "Descartar" de la UI tiene el mismo bug latente.
--
-- Idempotente: dropea todo CHECK de properties que refiera a la columna `status`
-- (la regex \ystatus\y NO matchea legal_status: el '_' es word char, sin boundary)
-- y lo recrea con la lista completa que usa la app (STATUS_LABELS de la ficha).
-- =============================================================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.properties'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ~ '\ystatus\y'
  LOOP
    EXECUTE format('ALTER TABLE public.properties DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.properties ADD CONSTRAINT properties_status_check
  CHECK (status IN (
    'draft', 'pending_docs', 'pending_photos', 'pending_review',
    'approved', 'rejected', 'active', 'descartada'
  ));

-- =============================================================================
-- Verificación:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.properties'::regclass AND conname='properties_status_check';
--   -- Debe listar 'descartada' entre los valores.
-- =============================================================================
