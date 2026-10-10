-- Sistema de visitas — Entrega 1, revisión final (grupo A, seguridad).
-- Se aplica con scripts/apply-visitas-escritura-pg.ts (por defecto SIMULACRO con ROLLBACK;
-- `--commit` para dejarla puesta).
--
-- POR QUÉ: las políticas de escritura de la migración 20260513000001 seguían vivas
-- (property_visits_insert_self, property_visits_update, property_visits_delete). Con la clave
-- anon del navegador + su propia sesión, cualquier usuario podía escribir DIRECTO en la tabla
-- por la API REST, salteando las rutas del servidor: un abogado creaba visitas a nombre de
-- cualquiera (la política de INSERT solo pedía created_by = él), y un asesor cambiaba
-- advisor_id / status / created_by / lead_id de sus visitas sin pasar por las reglas de
-- lib/visitas/transiciones.ts ni dejar el motivo que exige el historial.
--
-- Todas las escrituras legítimas ya pasan por el servidor con la clave de servicio
-- (lib/visitas/datos.ts, lib/leads/visit-scheduling.ts, el agente, el link del recorrido),
-- que no está sujeta a la RLS ni a estos GRANT. La LECTURA no cambia:
-- property_visits_select_scoped (20261010000002) sigue igual.
--
-- ORDEN OBLIGATORIO: se aplica DESPUÉS del deploy de la rama feat/sistema-visitas. El código
-- VIEJO que hoy está en producción (PUT /api/visits/[id] y /complete, que esta rama borra)
-- escribe con la sesión del usuario: aplicarla antes rompería esos botones hasta que se
-- publique el código nuevo.
--
-- Idempotente: DROP POLICY IF EXISTS + REVOKE (revocar algo que ya no está es un no-op).

SET lock_timeout = '5s';

DROP POLICY IF EXISTS property_visits_insert_self ON public.property_visits;
DROP POLICY IF EXISTS property_visits_update ON public.property_visits;
DROP POLICY IF EXISTS property_visits_delete ON public.property_visits;

-- Defensa en profundidad: sin políticas, la RLS ya rechaza INSERT/UPDATE/DELETE desde estos
-- roles; el REVOKE los frena ANTES de llegar a la RLS (permiso denegado, 42501) y además cubre
-- TRUNCATE, que no pasa por RLS. Mismo criterio que property_visit_events en 20261010000002.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.property_visits FROM anon, authenticated;
