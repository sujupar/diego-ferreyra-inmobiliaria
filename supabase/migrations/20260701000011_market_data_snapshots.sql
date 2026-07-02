-- Snapshots mensuales de datos de mercado + estado de ingesta + columnas de congelado
-- en appraisals + bucket de Storage. Correr a mano en el Dashboard. Idempotente.

-- 1) Snapshot CABA-wide: 1 fila por mes.
CREATE TABLE IF NOT EXISTS public.market_snapshot_caba (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period       date NOT NULL UNIQUE,          -- primer día del mes (UNIQUE ⇒ upsert válido)
  stock        jsonb,                         -- StockComposition (camelCase)
  escrituras   jsonb,                         -- EscriturasData
  price_caba   jsonb,                         -- NeighborhoodPrice CABA-wide (para "General")
  source_meta  jsonb,                         -- {bryn:{ok,error?},infogram:{...},colegio:{...}}
  captured_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2) Snapshot por barrio: 1 fila por (barrio, mes).
CREATE TABLE IF NOT EXISTS public.market_snapshot_neighborhood (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id uuid NOT NULL REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
  neighborhood_slug text NOT NULL,            -- denormalizado para lecturas sin join
  period          date NOT NULL,
  price           jsonb,                      -- NeighborhoodPrice
  property_types  jsonb,                      -- PropertyTypesCounts
  source_meta     jsonb,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (neighborhood_id, period)            -- upsert por (barrio,mes)
);
CREATE INDEX IF NOT EXISTS msn_slug_period_idx
  ON public.market_snapshot_neighborhood (neighborhood_slug, period DESC);

-- 3) Estado de ingesta (observabilidad; el cron escribe SIEMPRE, ok o fallo).
CREATE TABLE IF NOT EXISTS public.market_data_refresh_state (
  id          text PRIMARY KEY,               -- 'core' | 'zonaprop'
  period      date,
  last_run_at timestamptz,
  last_status text,                           -- 'ok' | 'partial' | 'failed'
  last_error  text,
  last_stats  jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4) Congelado por tasación (nullable ⇒ tasaciones legacy intactas).
ALTER TABLE public.appraisals ADD COLUMN IF NOT EXISTS neighborhood_slug text;
ALTER TABLE public.appraisals ADD COLUMN IF NOT EXISTS market_period date;

-- 5) RLS: lectura authenticated; escritura solo service_role (sin policy de INSERT/UPDATE).
ALTER TABLE public.market_snapshot_caba ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshot_neighborhood ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data_refresh_state ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_snapshot_caba' AND policyname='msc_select') THEN
    CREATE POLICY msc_select ON public.market_snapshot_caba FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_snapshot_neighborhood' AND policyname='msn_select') THEN
    CREATE POLICY msn_select ON public.market_snapshot_neighborhood FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_data_refresh_state' AND policyname='mdrs_select') THEN
    CREATE POLICY mdrs_select ON public.market_data_refresh_state FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 6) Bucket público para assets (imagen del gráfico del Colegio). Público porque
--    @react-pdf necesita URL HTTP pública para <Image src>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-data', 'market-data', true)
ON CONFLICT (id) DO NOTHING;

-- VERIFICACIÓN:
--   SELECT COUNT(*) FROM public.neighborhoods;                          -- 49
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='appraisals' AND column_name IN ('neighborhood_slug','market_period');  -- 2 filas
--   SELECT id, public FROM storage.buckets WHERE id='market-data';      -- public=true
