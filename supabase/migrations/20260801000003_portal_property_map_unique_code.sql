-- Hallazgo #10 (revisión adversarial 2026-07-31, .superpowers/sdd/2026-07-31-campana-y-chat-pro/review-final.md):
-- el auto-registro de avisos huérfanos en `app/api/cron/portal-inquiries/route.ts`
-- deduplica con `select ... eq(portal) eq(external_code) maybeSingle()`, pero el
-- índice que había en (portal, external_code) NO era único
-- (`idx_portal_map_portal_code`, migración 20260603000001). Si alguna vez llegan a
-- coexistir dos filas con el mismo par, `maybeSingle()` devuelve error, `known`
-- queda `null` y se inserta UNA FILA NUEVA por cada consulta de ese aviso.
--
-- Verificado el 2026-08-01 contra la base real (proyecto mncsnastmcjdjxrehdep):
-- 0 duplicados hoy en (portal, external_code) con external_code no nulo, así que
-- la constraint se puede crear sin limpieza previa.
--
-- `refresh-zonaprop-map` ya actualiza (no inserta) filas existentes, así que el
-- riesgo hoy es bajo — pero el auto-registro del cron de consultas SÍ depende de
-- que el SELECT de dedup sea confiable, y un `.upsert(..., {onConflict})` (patrón
-- ya usado en otras tablas del proyecto, ver CLAUDE.md § "Supabase upsert con
-- onConflict requiere UNIQUE constraint") directamente NO funciona sin esto.
--
-- El índice viejo (no único) queda redundante una vez creado el nuevo — Postgres
-- no lo va a usar para nada que el nuevo no cubra ya, así que se dropea.
DROP INDEX IF EXISTS public.idx_portal_map_portal_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_map_portal_code_unique
  ON public.portal_property_map (portal, external_code)
  WHERE external_code IS NOT NULL;

COMMENT ON INDEX public.idx_portal_map_portal_code_unique IS
  'UNIQUE parcial (solo con external_code no nulo) — respalda el dedup del auto-registro de avisos huérfanos en /api/cron/portal-inquiries y habilitaría un futuro .upsert(..., {onConflict: ''portal,external_code''}).';
