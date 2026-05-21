-- Métricas — agregar columna landing_page_views en meta_ads_daily
-- El usuario reportó que "clics" no es la métrica adecuada para medir el
-- rendimiento de la landing; "visitas a la página" (landing page views) sí
-- lo es porque excluye clics que rebotan antes de cargar la landing.
--
-- Mantenemos la columna `clicks` para no perder histórico, agregamos
-- `landing_page_views` y a partir de ahora el código backend la pobla
-- desde el campo `actions[].action_type='landing_page_view'` de Meta API.

ALTER TABLE meta_ads_daily
  ADD COLUMN IF NOT EXISTS landing_page_views INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN meta_ads_daily.landing_page_views IS
  'Visitas a la landing (Meta action landing_page_view). Más fiel a la métrica de campaña que clicks (excluye rebotes pre-carga).';
