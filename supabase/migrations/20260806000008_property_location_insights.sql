-- Investigación de la ubicación (hechos de la zona) cacheada por propiedad.
-- La generan los flujos de landing/portales UNA vez (ScraperAPI Google + datos
-- de mercado propios, SIN IA); refresh solo explícito. Shape del jsonb:
-- LocationInsights en lib/marketing/location-insights.ts.
-- OJO numeración: 20260806000007 la usa otra sesión (conversation_ai_state_property).

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS location_insights jsonb,
  ADD COLUMN IF NOT EXISTS location_insights_at timestamptz;

COMMENT ON COLUMN public.properties.location_insights IS
  'Hechos reales de la zona (transporte/comercios/educación/verde + mercado) para los prompts de descripción de portales y copy de landing. Shape: LocationInsights en lib/marketing/location-insights.ts';
COMMENT ON COLUMN public.properties.location_insights_at IS
  'Cuándo se investigó la zona por última vez (cache; refresh solo explícito).';
