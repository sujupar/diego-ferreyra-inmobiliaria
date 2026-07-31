-- Hallazgo H9 (revisión adversarial 2026-08-01, .superpowers/sdd/2026-08-01-etiquetas-y-chat-crm/review-final.md):
-- `lead_tag_assignments` y `lead_state_history` (migración 20260801000001)
-- quedaron legibles por CUALQUIER autenticado que no sea abogado
-- (`NOT public.is_lawyer()`), sin scoping por asesor — más laxo que el
-- precedente real del repo (`legal_review_events`, migración
-- 20260505000001_rls_per_role_safe.sql: `is_operations_user() OR is_lawyer()
-- OR actor_id = auth.uid()`). Vía el cliente autenticado del navegador (no la
-- app — TODAS las rutas de la app usan service role y hacen su propia
-- autorización, ver `lib/leads/authorize-lead-access.ts`), un asesor con su
-- JWT podía leer las asignaciones de etiquetas y el historial de estado de
-- leads de OTRO asesor.
--
-- Por qué se endurece esto y no `lead_tags`: `lead_tags` es un catálogo de
-- colores/labels sin referencia a ningún lead puntual — no hay nada que
-- scopear ahí. `lead_tag_assignments`/`lead_state_history` sí referencian un
-- `lead_id` concreto, así que el mismo criterio de "dueño real" que ya usa
-- `authorizeLeadAccess` (lead.assigned_to = auth.uid() O la propiedad del
-- lead está asignada al asesor) se traslada acá. NINGUNA ruta de la app deja
-- de andar: ya filtran por ownership en código con el cliente admin — esto es
-- defensa en profundidad para el caso de acceso directo a la API REST de
-- Supabase con el JWT del asesor, no un cambio de comportamiento de la app.
--
-- OJO al aplicar: es reemplazo de política existente (`DROP POLICY IF EXISTS`
-- + `CREATE POLICY`), no aditivo puro — pero no toca datos ni columnas, solo
-- USING de SELECT. Verificar después de aplicar: un asesor de prueba sigue
-- viendo SUS leads en /inbox (etiquetas + historial de estado) y NO ve los de
-- otro asesor si consulta la REST API directo con su propio JWT.

DROP POLICY IF EXISTS lead_tag_assignments_read ON lead_tag_assignments;
CREATE POLICY lead_tag_assignments_read ON lead_tag_assignments FOR SELECT TO authenticated
  USING (
    NOT public.is_lawyer()
    AND (
      public.is_operations_user()
      OR EXISTS (
        SELECT 1 FROM property_leads pl
        WHERE pl.id = lead_tag_assignments.lead_id
          AND (
            pl.assigned_to = auth.uid()
            OR EXISTS (
              SELECT 1 FROM properties p
              WHERE p.id = pl.property_id AND p.assigned_to = auth.uid()
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS lead_state_history_read ON lead_state_history;
CREATE POLICY lead_state_history_read ON lead_state_history FOR SELECT TO authenticated
  USING (
    NOT public.is_lawyer()
    AND (
      public.is_operations_user()
      OR EXISTS (
        SELECT 1 FROM property_leads pl
        WHERE pl.id = lead_state_history.lead_id
          AND (
            pl.assigned_to = auth.uid()
            OR EXISTS (
              SELECT 1 FROM properties p
              WHERE p.id = pl.property_id AND p.assigned_to = auth.uid()
            )
          )
      )
    )
  );

COMMENT ON POLICY lead_tag_assignments_read ON lead_tag_assignments IS
  'Operaciones ve todo; el asesor solo asignaciones de SUS leads (directo o vía propiedad). El abogado queda afuera. Endurecido en 20260801000004 (hallazgo H9) — antes era NOT is_lawyer() sin scoping.';
COMMENT ON POLICY lead_state_history_read ON lead_state_history IS
  'Mismo criterio que lead_tag_assignments_read. Endurecido en 20260801000004 (hallazgo H9).';
