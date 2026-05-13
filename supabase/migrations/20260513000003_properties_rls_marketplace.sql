-- Marketplace: cualquier usuario autenticado lee todas las propiedades.
-- La distinción "mías vs todas" se hace en UI (badge + filtro), no en RLS.

DROP POLICY IF EXISTS properties_select_owner_ops_or_lawyer ON properties;
DROP POLICY IF EXISTS properties_select ON properties;

CREATE POLICY properties_select_all_authenticated ON properties
  FOR SELECT TO authenticated
  USING (true);

-- Las policies de INSERT/UPDATE/DELETE NO se tocan — siguen restringidas por rol/ownership.
