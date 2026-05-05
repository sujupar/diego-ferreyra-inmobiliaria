-- =============================================================================
-- Migration: Granular RLS policies by role
-- Date: 2026-05-05
--
-- OBJETIVO
-- --------
-- Reemplazar las policies "Enable all access for authenticated users" (que
-- permiten a cualquier usuario autenticado leer/escribir cualquier fila) por
-- policies granulares según el rol del usuario y la propiedad del registro.
--
-- ESTRATEGIA POR ROL
-- ------------------
-- - admin / dueno (privileged) → acceso completo a todo.
-- - coordinador (operations) → ve y gestiona toda la operación: deals,
--   properties, contacts, appraisals, tasks. NO accede a configuración global
--   ni reportes financieros (esos son admin only).
-- - asesor → solo registros donde es dueño (assigned_to = uid o created_by = uid).
-- - abogado → solo lectura/revisión de properties + creación de
--   legal_review_events.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar y ejecutar este archivo COMPLETO en una sola corrida.
-- 3. Verificar que las queries de la app siguen funcionando (probá login con
--    cada rol y ejecutá las acciones típicas: ver tasaciones, crear deal, etc).
-- 4. Si algo se rompe, hay un BLOQUE DE ROLLBACK al final que revierte a
--    "todo abierto" temporalmente — útil para debug en caliente.
--
-- DEPENDENCIA
-- -----------
-- Asume que las helpers `get_my_role()` e `is_privileged_user()` ya existen
-- (creadas en `20260429000000_fix_profiles_rls_recursion.sql`).
-- =============================================================================

-- =============================================================================
-- STEP 1: Helpers adicionales
-- =============================================================================

-- True si el usuario actual es admin, dueño o coordinador (acceso a operaciones).
CREATE OR REPLACE FUNCTION public.is_operations_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'dueno', 'coordinador') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- True si el usuario actual es abogado.
CREATE OR REPLACE FUNCTION public.is_lawyer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'abogado' FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.is_operations_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lawyer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_operations_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lawyer() TO authenticated;


-- =============================================================================
-- STEP 2: Helper para dropear policies existentes por tabla
-- =============================================================================
-- Genérico: dropea TODAS las policies actuales de una tabla.

DO $$
DECLARE
    tbl text;
    pol RECORD;
    target_tables text[] := ARRAY[
        'appraisals',
        'appraisal_comparables',
        'comparables',
        'property_images',
        'deals',
        'properties',
        'contacts',
        'scheduled_appraisals',
        'tasks',
        'legal_review_events',
        'invitations',
        'notification_settings',
        'email_notifications_log',
        'notification_logs',
        'email_report_log',
        'report_settings',
        'market_image_settings',
        'meta_ads_daily',
        'ghl_pipeline_daily',
        'ghl_commercial_actions_daily',
        'merge_deal_visit_data'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        -- Si la tabla no existe, skip (no fail)
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            FOR pol IN
                SELECT polname FROM pg_policy
                WHERE polrelid = ('public.' || tbl)::regclass
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, tbl);
            END LOOP;
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- STEP 3: APPRAISALS — tasaciones
-- =============================================================================
-- assigned_to: asesor responsable. user_id: creador (legacy, puede ser null).

ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;

-- SELECT: dueños (assigned_to/user_id) o operaciones (admin/dueno/coordinador)
CREATE POLICY "appraisals_select_owner_or_ops"
    ON public.appraisals FOR SELECT TO authenticated
    USING (
        assigned_to = auth.uid()
        OR user_id = auth.uid()
        OR public.is_operations_user()
    );

-- INSERT: cualquier authenticated puede crear, pero el assigned_to debe
-- ser él mismo (o no asignado), salvo que sea de operaciones.
CREATE POLICY "appraisals_insert_self_or_ops"
    ON public.appraisals FOR INSERT TO authenticated
    WITH CHECK (
        public.is_operations_user()
        OR assigned_to IS NULL
        OR assigned_to = auth.uid()
        OR user_id = auth.uid()
    );

-- UPDATE: dueño o ops
CREATE POLICY "appraisals_update_owner_or_ops"
    ON public.appraisals FOR UPDATE TO authenticated
    USING (
        assigned_to = auth.uid()
        OR user_id = auth.uid()
        OR public.is_operations_user()
    )
    WITH CHECK (
        assigned_to = auth.uid()
        OR user_id = auth.uid()
        OR public.is_operations_user()
    );

-- DELETE: solo privileged
CREATE POLICY "appraisals_delete_privileged"
    ON public.appraisals FOR DELETE TO authenticated
    USING (public.is_privileged_user());


-- =============================================================================
-- STEP 4: APPRAISAL_COMPARABLES — comparables linkeados a una tasación
-- =============================================================================
-- Acceso heredado del appraisal padre.

ALTER TABLE public.appraisal_comparables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appraisal_comparables_inherit_appraisal"
    ON public.appraisal_comparables FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.appraisals a
            WHERE a.id = appraisal_id
            AND (
                a.assigned_to = auth.uid()
                OR a.user_id = auth.uid()
                OR public.is_operations_user()
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.appraisals a
            WHERE a.id = appraisal_id
            AND (
                a.assigned_to = auth.uid()
                OR a.user_id = auth.uid()
                OR public.is_operations_user()
            )
        )
    );


-- =============================================================================
-- STEP 5: COMPARABLES y PROPERTY_IMAGES (legacy del initial schema)
-- =============================================================================
-- Estas son las tablas legacy del esquema inicial. Si todavía se usan, mismas
-- reglas que appraisal_comparables. Si no se usan, las policies son inocuas.

ALTER TABLE public.comparables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comparables_inherit_appraisal"
    ON public.comparables FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.appraisals a
            WHERE a.id = appraisal_id
            AND (
                a.assigned_to = auth.uid()
                OR a.user_id = auth.uid()
                OR public.is_operations_user()
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.appraisals a
            WHERE a.id = appraisal_id
            AND (
                a.assigned_to = auth.uid()
                OR a.user_id = auth.uid()
                OR public.is_operations_user()
            )
        )
    );

ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property_images_inherit_appraisal"
    ON public.property_images FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.appraisals a
            WHERE a.id = appraisal_id
            AND (
                a.assigned_to = auth.uid()
                OR a.user_id = auth.uid()
                OR public.is_operations_user()
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.appraisals a
            WHERE a.id = appraisal_id
            AND (
                a.assigned_to = auth.uid()
                OR a.user_id = auth.uid()
                OR public.is_operations_user()
            )
        )
    );


-- =============================================================================
-- STEP 6: DEALS — pipeline / oportunidades
-- =============================================================================
-- assigned_to: asesor responsable. created_by: quién creó (puede ser
-- coordinador asignándolo a un asesor).

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_select_owner_or_ops"
    ON public.deals FOR SELECT TO authenticated
    USING (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.is_operations_user()
    );

CREATE POLICY "deals_insert_authenticated"
    ON public.deals FOR INSERT TO authenticated
    WITH CHECK (
        public.is_operations_user()
        OR assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR (assigned_to IS NULL AND created_by IS NULL)
    );

CREATE POLICY "deals_update_owner_or_ops"
    ON public.deals FOR UPDATE TO authenticated
    USING (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.is_operations_user()
    )
    WITH CHECK (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.is_operations_user()
    );

CREATE POLICY "deals_delete_privileged"
    ON public.deals FOR DELETE TO authenticated
    USING (public.is_privileged_user());


-- =============================================================================
-- STEP 7: PROPERTIES — fichas de propiedad
-- =============================================================================
-- Abogados también las leen para revisión legal. Asesor solo las propias.

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_select_owner_ops_or_lawyer"
    ON public.properties FOR SELECT TO authenticated
    USING (
        assigned_to = auth.uid()
        OR public.is_operations_user()
        OR public.is_lawyer()
    );

CREATE POLICY "properties_insert_authenticated"
    ON public.properties FOR INSERT TO authenticated
    WITH CHECK (
        public.is_operations_user()
        OR assigned_to = auth.uid()
        OR assigned_to IS NULL
    );

-- UPDATE: dueño, ops, o abogado (este último solo para fields de revisión legal,
-- pero a nivel SQL no podemos restringir columnas — la app debe validar qué
-- updates permite).
CREATE POLICY "properties_update_owner_ops_or_lawyer"
    ON public.properties FOR UPDATE TO authenticated
    USING (
        assigned_to = auth.uid()
        OR public.is_operations_user()
        OR public.is_lawyer()
    )
    WITH CHECK (
        assigned_to = auth.uid()
        OR public.is_operations_user()
        OR public.is_lawyer()
    );

CREATE POLICY "properties_delete_privileged"
    ON public.properties FOR DELETE TO authenticated
    USING (public.is_privileged_user());


-- =============================================================================
-- STEP 8: CONTACTS — contactos del CRM
-- =============================================================================

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select_owner_or_ops"
    ON public.contacts FOR SELECT TO authenticated
    USING (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.is_operations_user()
    );

CREATE POLICY "contacts_insert_authenticated"
    ON public.contacts FOR INSERT TO authenticated
    WITH CHECK (
        public.is_operations_user()
        OR assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR (assigned_to IS NULL AND created_by IS NULL)
    );

CREATE POLICY "contacts_update_owner_or_ops"
    ON public.contacts FOR UPDATE TO authenticated
    USING (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.is_operations_user()
    )
    WITH CHECK (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR public.is_operations_user()
    );

CREATE POLICY "contacts_delete_privileged"
    ON public.contacts FOR DELETE TO authenticated
    USING (public.is_privileged_user());


-- =============================================================================
-- STEP 9: SCHEDULED_APPRAISALS — tasaciones agendadas (CRM legacy)
-- =============================================================================
-- Si la tabla existe en el schema, le aplicamos policies similares a contacts.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'scheduled_appraisals'
    ) THEN
        EXECUTE 'ALTER TABLE public.scheduled_appraisals ENABLE ROW LEVEL SECURITY';

        EXECUTE 'CREATE POLICY "scheduled_appraisals_select_owner_or_ops"
            ON public.scheduled_appraisals FOR SELECT TO authenticated
            USING (
                assigned_to = auth.uid()
                OR created_by = auth.uid()
                OR public.is_operations_user()
            )';

        EXECUTE 'CREATE POLICY "scheduled_appraisals_insert_authenticated"
            ON public.scheduled_appraisals FOR INSERT TO authenticated
            WITH CHECK (
                public.is_operations_user()
                OR assigned_to = auth.uid()
                OR created_by = auth.uid()
                OR (assigned_to IS NULL AND created_by IS NULL)
            )';

        EXECUTE 'CREATE POLICY "scheduled_appraisals_update_owner_or_ops"
            ON public.scheduled_appraisals FOR UPDATE TO authenticated
            USING (
                assigned_to = auth.uid()
                OR created_by = auth.uid()
                OR public.is_operations_user()
            )
            WITH CHECK (
                assigned_to = auth.uid()
                OR created_by = auth.uid()
                OR public.is_operations_user()
            )';

        EXECUTE 'CREATE POLICY "scheduled_appraisals_delete_privileged"
            ON public.scheduled_appraisals FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 10: TASKS — tareas / pendientes
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tasks'
    ) THEN
        EXECUTE 'ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY';

        EXECUTE 'CREATE POLICY "tasks_select_assigned_or_ops"
            ON public.tasks FOR SELECT TO authenticated
            USING (
                assigned_to = auth.uid()
                OR public.is_operations_user()
            )';

        -- INSERT: el sistema crea tasks dinámicamente; cualquier authenticated puede.
        EXECUTE 'CREATE POLICY "tasks_insert_authenticated"
            ON public.tasks FOR INSERT TO authenticated
            WITH CHECK (true)';

        EXECUTE 'CREATE POLICY "tasks_update_assigned_or_ops"
            ON public.tasks FOR UPDATE TO authenticated
            USING (
                assigned_to = auth.uid()
                OR public.is_operations_user()
            )
            WITH CHECK (
                assigned_to = auth.uid()
                OR public.is_operations_user()
            )';

        EXECUTE 'CREATE POLICY "tasks_delete_privileged"
            ON public.tasks FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 11: LEGAL_REVIEW_EVENTS — historial de revisión legal
-- =============================================================================

ALTER TABLE public.legal_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_review_events_select_ops_or_lawyer"
    ON public.legal_review_events FOR SELECT TO authenticated
    USING (
        public.is_operations_user()
        OR public.is_lawyer()
        OR actor_id = auth.uid()
    );

-- INSERT: solo abogados u ops (los abogados crean los eventos al revisar).
CREATE POLICY "legal_review_events_insert_lawyer_or_ops"
    ON public.legal_review_events FOR INSERT TO authenticated
    WITH CHECK (
        public.is_lawyer()
        OR public.is_operations_user()
    );

CREATE POLICY "legal_review_events_delete_privileged"
    ON public.legal_review_events FOR DELETE TO authenticated
    USING (public.is_privileged_user());


-- =============================================================================
-- STEP 12: INVITATIONS — invitaciones a nuevos usuarios
-- =============================================================================
-- Solo admin/dueno pueden listarlas y crearlas. El accept-invite usa el service
-- role key (bypass RLS) del lado server, así que no necesita policies para
-- esa parte.

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_all_privileged"
    ON public.invitations FOR ALL TO authenticated
    USING (public.is_privileged_user())
    WITH CHECK (public.is_privileged_user());


-- =============================================================================
-- STEP 13: TABLAS ADMIN-ONLY (configuración, reportes, ad warehousing)
-- =============================================================================
-- Estas son tablas de configuración global, logs internos o data warehousing
-- que solo admin/dueno deberían ver.

DO $$
DECLARE
    admin_only_tables text[] := ARRAY[
        'notification_settings',
        'email_notifications_log',
        'notification_logs',
        'email_report_log',
        'report_settings',
        'market_image_settings',
        'meta_ads_daily',
        'ghl_pipeline_daily',
        'ghl_commercial_actions_daily',
        'merge_deal_visit_data'
    ];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY admin_only_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format(
                'CREATE POLICY "%s_admin_only" ON public.%I FOR ALL TO authenticated USING (public.is_privileged_user()) WITH CHECK (public.is_privileged_user())',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- VERIFICACIÓN POST-APLICACIÓN
-- =============================================================================
-- Ejecutar en SQL Editor para listar todas las policies activas:
--
--   SELECT schemaname, tablename, policyname, permissive, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- Cada tabla sensible debe tener policies con `is_operations_user()`,
-- `is_privileged_user()`, `is_lawyer()`, o referencias a `auth.uid()`.
-- Ninguna debe tener `using (true)` excepto `tasks_insert_authenticated`.
--
-- Test funcional con cada rol:
-- 1. Login como asesor → /appraisals: solo ve las propias.
-- 2. Login como coordinador → /appraisals: ve todas.
-- 3. Login como abogado → /properties/review: ve todas las que necesita revisar.
-- 4. Login como admin → todo accesible.
-- =============================================================================


-- =============================================================================
-- ROLLBACK (en caso de emergencia, ejecutar este bloque)
-- =============================================================================
-- Descomentá y ejecutá si necesitas revertir TEMPORALMENTE a "todo abierto"
-- mientras debuggueás. NO dejar abierto en producción.
--
-- DO $$
-- DECLARE
--     tbl text;
--     pol RECORD;
--     target_tables text[] := ARRAY[
--         'appraisals', 'appraisal_comparables', 'comparables', 'property_images',
--         'deals', 'properties', 'contacts', 'scheduled_appraisals', 'tasks',
--         'legal_review_events', 'invitations',
--         'notification_settings', 'email_notifications_log', 'notification_logs',
--         'email_report_log', 'report_settings', 'market_image_settings',
--         'meta_ads_daily', 'ghl_pipeline_daily', 'ghl_commercial_actions_daily',
--         'merge_deal_visit_data'
--     ];
-- BEGIN
--     FOREACH tbl IN ARRAY target_tables LOOP
--         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
--             FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = ('public.' || tbl)::regclass LOOP
--                 EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, tbl);
--             END LOOP;
--             EXECUTE format('CREATE POLICY "tmp_open_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
--         END IF;
--     END LOOP;
-- END $$;
