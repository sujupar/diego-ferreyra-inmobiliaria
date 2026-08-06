-- =============================================================================
-- Estado comercial de la propiedad
-- =============================================================================
-- POR QUÉ UNA COLUMNA NUEVA Y NO `status`: checkAndAdvanceProperty
-- (lib/supabase/properties.ts) escribe status='approved' en CADA commit de
-- multimedia cuando hay fotos + legal aprobado. Un estado comercial guardado
-- ahí se borraría solo y re-dispararía los emails N8A/N8B de captación.
-- Además el trigger de 20260514000002 aprovisiona campaña Meta al pasar a
-- 'approved'. Ver el spec 2026-08-06-estado-comercial-propiedad-design.md §2.
--
-- OJO: si mañana se agrega un estado, hay que tocar ESTE CHECK y el catálogo de
-- lib/properties/commercial-status.ts JUNTOS, o la app escribe un valor que la
-- base rechaza con 23514.
--
-- Idempotente: se puede re-ejecutar sin efectos.
-- =============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'disponible',
  ADD COLUMN IF NOT EXISTS sold_price        NUMERIC,
  ADD COLUMN IF NOT EXISTS sold_currency     TEXT,
  ADD COLUMN IF NOT EXISTS sold_at           DATE;

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_commercial_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_commercial_status_check
  CHECK (commercial_status IN ('disponible','reservada','vendida','dada_de_baja','descartada'));

COMMENT ON COLUMN public.properties.commercial_status IS
  'Estado comercial (eje independiente de status, que describe la captación). Fuente de verdad.';
COMMENT ON COLUMN public.properties.sold_price IS
  'Precio REAL de la operación cerrada. NULL si la propiedad no está vendida.';
COMMENT ON COLUMN public.properties.sold_currency IS
  'Moneda de la operación: puede diferir de properties.currency (la publicada).';

-- Historial: solo crece, nunca se actualiza ni se borra.
CREATE TABLE IF NOT EXISTS public.property_status_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  reason        TEXT,
  sold_price    NUMERIC,
  sold_currency TEXT,
  sold_at       DATE,
  -- ON DELETE SET NULL es obligatorio en toda FK a profiles(id): con NO ACTION,
  -- borrar un usuario desde Supabase Auth falla con "Database error deleting user".
  changed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_status_events_property
  ON public.property_status_events (property_id, created_at DESC);

ALTER TABLE public.property_status_events ENABLE ROW LEVEL SECURITY;

-- Lectura solo para operaciones (el abogado no ve datos comerciales).
-- La escritura va con service role desde la ruta de API: sin política de INSERT.
DROP POLICY IF EXISTS property_status_events_read ON public.property_status_events;
CREATE POLICY property_status_events_read ON public.property_status_events
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- Backfill: las descartadas de hoy nacen con el estado comercial correcto.
-- No se inventan eventos históricos: no sabemos quién ni cuándo las descartó.
UPDATE public.properties
   SET commercial_status = 'descartada'
 WHERE status = 'descartada' AND commercial_status = 'disponible';

-- =============================================================================
-- Verificación:
--   SELECT commercial_status, count(*) FROM properties GROUP BY 1;
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.properties'::regclass
--      AND conname='properties_commercial_status_check';
-- =============================================================================
