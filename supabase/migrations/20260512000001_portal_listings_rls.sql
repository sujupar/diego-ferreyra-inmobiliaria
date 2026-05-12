-- =============================================================================
-- Migration: RLS para tablas de portales
-- Date: 2026-05-12
--
-- POLÍTICAS
-- ---------
-- - property_listings: read según rol (asesor solo sus propiedades, otros
--   roles privilegiados ven todo). Write solo service_role.
-- - property_metrics_daily: mismo patrón que listings.
-- - portal_credentials: read solo admin/dueno. Write solo service_role.
-- - property_publish_events: read según rol (igual que listings).
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Aplicar PRIMERO la migración 20260512000000_portal_listings_schema.sql.
-- 2. Pegar este archivo en Supabase Dashboard → SQL Editor → Run.
-- 3. Verificar con:
--      SELECT polname, polrelid::regclass FROM pg_policy
--      WHERE polrelid::regclass::text LIKE 'public.property_listings'
--         OR polrelid::regclass::text LIKE 'public.property_metrics_daily'
--         OR polrelid::regclass::text LIKE 'public.portal_credentials'
--         OR polrelid::regclass::text LIKE 'public.property_publish_events';
-- =============================================================================

ALTER TABLE public.property_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_publish_events ENABLE ROW LEVEL SECURITY;

-- property_listings: read según rol
DROP POLICY IF EXISTS listings_select ON public.property_listings;
CREATE POLICY listings_select ON public.property_listings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_listings.property_id
              AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- property_metrics_daily: mismo patrón
DROP POLICY IF EXISTS metrics_select ON public.property_metrics_daily;
CREATE POLICY metrics_select ON public.property_metrics_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_metrics_daily.property_id
              AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- portal_credentials: solo admin/dueno pueden leer (no exponer tokens a otros)
DROP POLICY IF EXISTS credentials_select ON public.portal_credentials;
CREATE POLICY credentials_select ON public.portal_credentials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'dueno')
    )
  );

-- property_publish_events: read según rol (igual que listings)
DROP POLICY IF EXISTS publish_events_select ON public.property_publish_events;
CREATE POLICY publish_events_select ON public.property_publish_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_publish_events.property_id
              AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- No policies de INSERT/UPDATE/DELETE para authenticated:
-- por default RLS niega lo no permitido. Solo service_role puede escribir.
