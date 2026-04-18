-- =============================================================================
-- Limpieza de tasaciones duplicadas
-- =============================================================================
-- Causa raíz (ya arreglada en código):
--   /appraisal/new no actualizaba la URL con ?editId=... después del primer
--   guardado, así que cada click en "Calcular" insertaba una tasación nueva
--   en vez de actualizar la existente. Cada inserción además disparaba una
--   auto-creación de deal, multiplicando deals también.
--
-- Heurística de dedup:
--   Dos tasaciones se consideran duplicadas si tienen la MISMA
--   `property_location` y el MISMO `assigned_to` (o ambas con assigned_to NULL),
--   y se crearon a < 1 hora una de la otra. Dentro de un cluster, mantenemos
--   la MÁS RECIENTE (asumimos que es la versión final que el asesor quiso) y
--   borramos las anteriores.
--
-- Tasaciones legítimamente repetidas (re-tasaciones meses después) NO se
-- tocan: la ventana de 1 hora las preserva.
--
-- USAR EN ORDEN:
--   1) Bloque PREVIEW: corré primero, mirá el conteo, validá.
--   2) Bloque CLEANUP: descomentá y corré una sola vez.
--
-- Las FKs:
--   - appraisal_comparables.appraisal_id → ON DELETE CASCADE (se limpia solo)
--   - deals.appraisal_id → sin CASCADE: re-apuntamos al kept antes de borrar
--   - properties.appraisal_id → sin CASCADE: re-apuntamos al kept antes de borrar
--   - scheduled_appraisals.appraisal_id → sin CASCADE: re-apuntamos al kept
-- =============================================================================


-- =============================================================================
-- BLOQUE 1: PREVIEW (correr primero — solo lee, no modifica nada)
-- =============================================================================

-- Conteo total de tasaciones
SELECT COUNT(*) AS total_appraisals FROM appraisals;

-- Cuántas son duplicadas (a borrar) según la heurística de 1h:
WITH grouped AS (
    SELECT
        id,
        property_location,
        assigned_to,
        created_at,
        LAG(created_at) OVER (
            PARTITION BY property_location, COALESCE(assigned_to::text, '__nulluser__')
            ORDER BY created_at DESC
        ) AS next_newer_at
    FROM appraisals
)
SELECT
    COUNT(*) AS duplicates_to_delete,
    MIN(created_at) AS oldest_dup,
    MAX(created_at) AS newest_dup
FROM grouped
WHERE next_newer_at IS NOT NULL
  AND (next_newer_at - created_at) < INTERVAL '1 hour';

-- Detalle por propiedad de los duplicados (revisá esto antes de borrar):
WITH grouped AS (
    SELECT
        id,
        property_location,
        assigned_to,
        publication_price,
        currency,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY property_location, COALESCE(assigned_to::text, '__nulluser__')
            ORDER BY created_at DESC
        ) AS rn,
        LAG(created_at) OVER (
            PARTITION BY property_location, COALESCE(assigned_to::text, '__nulluser__')
            ORDER BY created_at DESC
        ) AS next_newer_at
    FROM appraisals
)
SELECT
    property_location,
    COUNT(*) AS dup_count,
    MIN(created_at) AS first_dup_created,
    MAX(created_at) AS latest_dup_created
FROM grouped
WHERE next_newer_at IS NOT NULL
  AND (next_newer_at - created_at) < INTERVAL '1 hour'
GROUP BY property_location
ORDER BY dup_count DESC, latest_dup_created DESC
LIMIT 50;


-- =============================================================================
-- BLOQUE 2: CLEANUP (descomentá las 4 secciones y correlas en orden)
-- =============================================================================
-- Asegurate de que el preview anterior te haya mostrado un número razonable
-- antes de descomentar. Una vez corras esto, las tasaciones borradas no
-- se pueden recuperar.
--
-- ⚠️  EDGE CASE A REVISAR EN EL PREVIEW:
-- Si una propiedad tiene tanto duplicados (<1h entre sí) COMO una re-tasación
-- legítima posterior (>1h después), keeper_id va a ser la re-tasación más
-- reciente del partition completo. Esto re-apunta los deals/properties que
-- pertenecían a los duplicados al keeper "más nuevo" — incluso si ese
-- keeper es semánticamente una tasación distinta (re-tasación meses después).
--
-- Validá manualmente en el preview los keeper_id antes de correr la cleanup,
-- especialmente para propiedades con dup_count >= 2 cuya latest_dup_created
-- esté lejos del primer registro de la propiedad.

/*
-- Identificá los duplicados a borrar (CTE materializada en tabla temporal
-- para que las queries siguientes la reusen sin recomputar):
CREATE TEMP TABLE dup_appraisals AS
WITH grouped AS (
    SELECT
        id,
        property_location,
        assigned_to,
        created_at,
        LAG(created_at) OVER (
            PARTITION BY property_location, COALESCE(assigned_to::text, '__nulluser__')
            ORDER BY created_at DESC
        ) AS next_newer_at,
        FIRST_VALUE(id) OVER (
            PARTITION BY property_location, COALESCE(assigned_to::text, '__nulluser__')
            ORDER BY created_at DESC
        ) AS keeper_id
    FROM appraisals
)
SELECT id AS dup_id, keeper_id
FROM grouped
WHERE next_newer_at IS NOT NULL
  AND (next_newer_at - created_at) < INTERVAL '1 hour';

-- 2.1 Re-apuntar deals.appraisal_id de duplicados al keeper
UPDATE deals d
SET appraisal_id = da.keeper_id,
    updated_at = NOW()
FROM dup_appraisals da
WHERE d.appraisal_id = da.dup_id;

-- 2.2 Re-apuntar properties.appraisal_id de duplicados al keeper
-- (properties.updated_at debe existir en el schema; si no, remové esa línea)
UPDATE properties p
SET appraisal_id = da.keeper_id,
    updated_at = NOW()
FROM dup_appraisals da
WHERE p.appraisal_id = da.dup_id;

-- 2.3 Re-apuntar scheduled_appraisals.appraisal_id de duplicados al keeper
UPDATE scheduled_appraisals sa
SET appraisal_id = da.keeper_id
FROM dup_appraisals da
WHERE sa.appraisal_id = da.dup_id;

-- 2.4 Borrar las tasaciones duplicadas
-- (appraisal_comparables se borra en cascada por su FK ON DELETE CASCADE)
DELETE FROM appraisals
WHERE id IN (SELECT dup_id FROM dup_appraisals);

-- Verificación post-cleanup:
SELECT COUNT(*) AS total_appraisals_after FROM appraisals;
*/


-- =============================================================================
-- BLOQUE 3 (opcional): limpieza de deals huérfanos auto-creados
-- =============================================================================
-- El bug también auto-creaba un deal cada vez que insertaba una tasación.
-- Si querés también limpiar deals que quedaron apuntando a tasaciones ya
-- borradas (appraisal_id ahora-NULL después del re-pointing), o deals
-- creados sin contacto válido, descomentá:

/*
-- Preview: deals que quedaron sin appraisal después del cleanup pero
-- todavía están en stage 'appraisal_sent' (probablemente auto-creados):
SELECT
    id,
    property_address,
    stage,
    created_at,
    appraisal_id,
    contact_id
FROM deals
WHERE stage = 'appraisal_sent'
  AND appraisal_id IS NULL
ORDER BY created_at DESC
LIMIT 50;
-- Revisá. Si son obviamente auto-creados (sin contact_id real, dirección
-- igual a otra captación legítima, etc.), borralos manualmente. NO lanzo
-- un DELETE automático aquí porque distinguir auto-creados de legítimos
-- requiere criterio humano.
*/
