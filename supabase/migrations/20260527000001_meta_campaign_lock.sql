-- =============================================================================
-- Lock atómico para prevenir doble creación de campaña Meta por property
-- =============================================================================
--
-- PROBLEMA REAL detectado en producción (2026-05-27):
-- El builder de campañas Meta tarda 60-150s (porque genera 10 imágenes
-- con Gemini). Si el frontend hace timeout, el usuario clickea "Crear"
-- de nuevo. Sin lock, los dos requests:
--   1. Pasan el check de "idempotencia" (no había campaña porque el
--      primero todavía no llegó a insertar en DB)
--   2. Ambos crean Campaign en Meta
--   3. Ambos hacen INSERT en property_meta_campaigns
-- → DOS campañas en Meta Ads Manager, dos filas en DB. Cobra plata
-- doble cuando se activan.
--
-- SOLUCIÓN: índice UNIQUE PARCIAL sobre property_id WHERE status no es
-- 'archived'. Solo puede existir UNA fila por property en cualquier
-- estado activo. El primer request gana; el segundo recibe error
-- de unique constraint y aborta.
--
-- El builder lo intercepta y devuelve la fila existente.
-- =============================================================================

-- Antes de crear el índice, asegurarnos de que NO hay duplicados existentes
-- que romperían la creación. Archivar duplicados conservando el más reciente.
WITH duplicates AS (
  SELECT id,
         property_id,
         ROW_NUMBER() OVER (
           PARTITION BY property_id
           ORDER BY created_at DESC
         ) AS rn
  FROM public.property_meta_campaigns
  WHERE status <> 'archived'
)
UPDATE public.property_meta_campaigns
SET status = 'archived',
    last_error = COALESCE(last_error, '') || ' [auto-archived by 20260527000001 dedup]'
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Crear el índice UNIQUE PARCIAL. Solo aplica a status <> 'archived'.
-- Esto permite que una property pueda tener su historial de campañas
-- archivadas (varias filas con status='archived') pero solo UNA activa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_meta_campaigns_one_active
  ON public.property_meta_campaigns (property_id)
  WHERE status <> 'archived';

-- Verificación post-migration:
--   SELECT property_id, COUNT(*) AS active_count
--   FROM property_meta_campaigns
--   WHERE status <> 'archived'
--   GROUP BY property_id
--   HAVING COUNT(*) > 1;
-- Debe NO devolver filas.
