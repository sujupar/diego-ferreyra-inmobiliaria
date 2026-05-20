-- HOTFIX — Fase 3 (métricas)
-- La tabla meta_ads_daily venía sin constraint UNIQUE(date, campaign_id), pero
-- todo el código de la app upserts con `onConflict: 'date,campaign_id'`. Sin la
-- constraint, el upsert no resuelve el conflicto y termina INSERTANDO filas
-- duplicadas. Tres scheduled functions (daily/weekly/monthly report) escriben
-- en la misma tabla, así que en cada corrida del cron se acumulaban duplicados.
--
-- Síntoma reportado por el usuario:
--   - Métricas de Meta Ads infladas en rangos multi-día (sumas duplicadas).
--   - El filtro "Ayer" se veía bien porque era un solo día con típicamente
--     1 corrida → menos duplicación.
--
-- Este script: (1) consolida duplicados manteniendo el row más reciente por
-- (date, campaign_id), (2) agrega la UNIQUE constraint que faltaba.
-- Es IDEMPOTENTE: se puede correr múltiples veces sin efectos negativos.

-- ============================================================================
-- 1) Diagnóstico previo (lectura, no modifica nada). Lo dejamos como comentario
--    para que se pueda correr antes/después manualmente y comparar.
-- ============================================================================
-- SELECT date, campaign_id, COUNT(*) AS dupes
-- FROM meta_ads_daily
-- GROUP BY date, campaign_id
-- HAVING COUNT(*) > 1
-- ORDER BY dupes DESC, date DESC
-- LIMIT 50;

-- ============================================================================
-- 2) Consolidar duplicados: mantener solo el row más reciente por
--    (date, campaign_id), usando fetched_at como tiebreaker (más nuevo gana).
-- ============================================================================
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY date, campaign_id
      ORDER BY fetched_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM meta_ads_daily
)
DELETE FROM meta_ads_daily
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================================
-- 3) Agregar UNIQUE constraint para que el upsert con
--    `onConflict: 'date,campaign_id'` funcione de aquí en adelante.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meta_ads_daily_date_campaign_id_key'
  ) THEN
    ALTER TABLE meta_ads_daily
      ADD CONSTRAINT meta_ads_daily_date_campaign_id_key
      UNIQUE (date, campaign_id);
  END IF;
END $$;

-- ============================================================================
-- 4) Índice para queries por (campaign_id) en rangos amplios (dashboards).
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_meta_ads_daily_campaign_date
  ON meta_ads_daily (campaign_id, date DESC);

COMMENT ON CONSTRAINT meta_ads_daily_date_campaign_id_key ON meta_ads_daily IS
  'HOTFIX 20260520 — sin esta constraint los upserts no resolvían conflicto y se duplicaban filas en cada corrida de los scheduled reports.';

-- ============================================================================
-- 5) Mismo problema en ghl_pipeline_daily. El upsert usa
--    onConflict: 'date,pipeline_id,stage_id' → necesita UNIQUE de esas 3 cols.
-- ============================================================================
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY date, pipeline_id, stage_id
      ORDER BY ctid DESC
    ) AS rn
  FROM ghl_pipeline_daily
)
DELETE FROM ghl_pipeline_daily
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ghl_pipeline_daily_date_pipeline_stage_key'
  ) THEN
    ALTER TABLE ghl_pipeline_daily
      ADD CONSTRAINT ghl_pipeline_daily_date_pipeline_stage_key
      UNIQUE (date, pipeline_id, stage_id);
  END IF;
END $$;

-- ============================================================================
-- 6) Mismo problema en ghl_commercial_actions_daily. Upsert con
--    onConflict: 'date' → necesita UNIQUE(date).
-- ============================================================================
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (PARTITION BY date ORDER BY ctid DESC) AS rn
  FROM ghl_commercial_actions_daily
)
DELETE FROM ghl_commercial_actions_daily
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ghl_commercial_actions_daily_date_key'
  ) THEN
    ALTER TABLE ghl_commercial_actions_daily
      ADD CONSTRAINT ghl_commercial_actions_daily_date_key
      UNIQUE (date);
  END IF;
END $$;
