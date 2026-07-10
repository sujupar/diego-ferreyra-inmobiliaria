-- =============================================================================
-- Migration: RLS granular por rol — VERSIÓN DEFENSIVA (idempotente)
-- Date: 2026-05-05
--
-- DIFERENCIA con la migración anterior 20260505000000:
-- TODA operación está envuelta en `IF EXISTS` — si una tabla no existe en la
-- DB, simplemente se salta sin error. Es seguro re-ejecutar este SQL múltiples
-- veces.
--
-- INSTRUCCIONES
-- -------------
-- Pegar TODO en Supabase Dashboard → SQL Editor → Run.
-- Si una tabla no existe, simplemente se ignora (no rompe la transacción).
-- =============================================================================

-- =============================================================================
-- STEP 1: Helpers (idempotentes con CREATE OR REPLACE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_operations_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'dueno', 'coordinador') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_lawyer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
-- STEP 2: Helper para aplicar policies por tabla (DRY)
-- =============================================================================
-- Crea una procedure interna que para una tabla dada:
--   1. Verifica que existe.
--   2. Dropea TODAS las policies actuales.
--   3. Habilita RLS.
--   4. Crea las policies que se le pasan.
--
-- Esto evita repetir el patrón 20+ veces y garantiza idempotencia.

DO $$
DECLARE
    tbl text;
    pol RECORD;
    -- Lista TODAS las tablas que potencialmente queremos cubrir
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
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- Dropear policies existentes
            FOR pol IN
                SELECT polname FROM pg_policy
                WHERE polrelid = ('public.' || tbl)::regclass
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, tbl);
            END LOOP;
            -- Habilitar RLS (idempotente)
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- STEP 3: APPRAISALS (tabla core, debe existir)
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appraisals') THEN
        EXECUTE 'CREATE POLICY "appraisals_select_owner_or_ops" ON public.appraisals FOR SELECT TO authenticated
            USING (assigned_to = auth.uid() OR user_id = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "appraisals_insert_self_or_ops" ON public.appraisals FOR INSERT TO authenticated
            WITH CHECK (public.is_operations_user() OR assigned_to IS NULL OR assigned_to = auth.uid() OR user_id = auth.uid())';
        EXECUTE 'CREATE POLICY "appraisals_update_owner_or_ops" ON public.appraisals FOR UPDATE TO authenticated
            USING (assigned_to = auth.uid() OR user_id = auth.uid() OR public.is_operations_user())
            WITH CHECK (assigned_to = auth.uid() OR user_id = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "appraisals_delete_privileged" ON public.appraisals FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 4: APPRAISAL_COMPARABLES (heredan acceso del appraisal padre)
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appraisal_comparables') THEN
        EXECUTE 'CREATE POLICY "appraisal_comparables_inherit_appraisal" ON public.appraisal_comparables FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM public.appraisals a WHERE a.id = appraisal_id AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid() OR public.is_operations_user())))
            WITH CHECK (EXISTS (SELECT 1 FROM public.appraisals a WHERE a.id = appraisal_id AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid() OR public.is_operations_user())))';
    END IF;
END $$;


-- =============================================================================
-- STEP 5: COMPARABLES y PROPERTY_IMAGES (legacy — solo si existen)
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comparables') THEN
        EXECUTE 'CREATE POLICY "comparables_inherit_appraisal" ON public.comparables FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM public.appraisals a WHERE a.id = appraisal_id AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid() OR public.is_operations_user())))
            WITH CHECK (EXISTS (SELECT 1 FROM public.appraisals a WHERE a.id = appraisal_id AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid() OR public.is_operations_user())))';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='property_images') THEN
        EXECUTE 'CREATE POLICY "property_images_inherit_appraisal" ON public.property_images FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM public.appraisals a WHERE a.id = appraisal_id AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid() OR public.is_operations_user())))
            WITH CHECK (EXISTS (SELECT 1 FROM public.appraisals a WHERE a.id = appraisal_id AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid() OR public.is_operations_user())))';
    END IF;
END $$;


-- =============================================================================
-- STEP 6: DEALS
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='deals') THEN
        EXECUTE 'CREATE POLICY "deals_select_owner_or_ops" ON public.deals FOR SELECT TO authenticated
            USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "deals_insert_authenticated" ON public.deals FOR INSERT TO authenticated
            WITH CHECK (public.is_operations_user() OR assigned_to = auth.uid() OR created_by = auth.uid() OR (assigned_to IS NULL AND created_by IS NULL))';
        EXECUTE 'CREATE POLICY "deals_update_owner_or_ops" ON public.deals FOR UPDATE TO authenticated
            USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())
            WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "deals_delete_privileged" ON public.deals FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 7: PROPERTIES (también accesible por abogados para revisión)
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='properties') THEN
        EXECUTE 'CREATE POLICY "properties_select_owner_ops_or_lawyer" ON public.properties FOR SELECT TO authenticated
            USING (assigned_to = auth.uid() OR public.is_operations_user() OR public.is_lawyer())';
        EXECUTE 'CREATE POLICY "properties_insert_authenticated" ON public.properties FOR INSERT TO authenticated
            WITH CHECK (public.is_operations_user() OR assigned_to = auth.uid() OR assigned_to IS NULL)';
        EXECUTE 'CREATE POLICY "properties_update_owner_ops_or_lawyer" ON public.properties FOR UPDATE TO authenticated
            USING (assigned_to = auth.uid() OR public.is_operations_user() OR public.is_lawyer())
            WITH CHECK (assigned_to = auth.uid() OR public.is_operations_user() OR public.is_lawyer())';
        EXECUTE 'CREATE POLICY "properties_delete_privileged" ON public.properties FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 8: CONTACTS
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contacts') THEN
        EXECUTE 'CREATE POLICY "contacts_select_owner_or_ops" ON public.contacts FOR SELECT TO authenticated
            USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "contacts_insert_authenticated" ON public.contacts FOR INSERT TO authenticated
            WITH CHECK (public.is_operations_user() OR assigned_to = auth.uid() OR created_by = auth.uid() OR (assigned_to IS NULL AND created_by IS NULL))';
        EXECUTE 'CREATE POLICY "contacts_update_owner_or_ops" ON public.contacts FOR UPDATE TO authenticated
            USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())
            WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "contacts_delete_privileged" ON public.contacts FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 9: SCHEDULED_APPRAISALS
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scheduled_appraisals') THEN
        EXECUTE 'CREATE POLICY "scheduled_appraisals_select_owner_or_ops" ON public.scheduled_appraisals FOR SELECT TO authenticated
            USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "scheduled_appraisals_insert_authenticated" ON public.scheduled_appraisals FOR INSERT TO authenticated
            WITH CHECK (public.is_operations_user() OR assigned_to = auth.uid() OR created_by = auth.uid() OR (assigned_to IS NULL AND created_by IS NULL))';
        EXECUTE 'CREATE POLICY "scheduled_appraisals_update_owner_or_ops" ON public.scheduled_appraisals FOR UPDATE TO authenticated
            USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())
            WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "scheduled_appraisals_delete_privileged" ON public.scheduled_appraisals FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 10: TASKS
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tasks') THEN
        EXECUTE 'CREATE POLICY "tasks_select_assigned_or_ops" ON public.tasks FOR SELECT TO authenticated
            USING (assigned_to = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "tasks_insert_authenticated" ON public.tasks FOR INSERT TO authenticated
            WITH CHECK (true)';
        EXECUTE 'CREATE POLICY "tasks_update_assigned_or_ops" ON public.tasks FOR UPDATE TO authenticated
            USING (assigned_to = auth.uid() OR public.is_operations_user())
            WITH CHECK (assigned_to = auth.uid() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "tasks_delete_privileged" ON public.tasks FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 11: LEGAL_REVIEW_EVENTS
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='legal_review_events') THEN
        EXECUTE 'CREATE POLICY "legal_review_events_select_ops_or_lawyer" ON public.legal_review_events FOR SELECT TO authenticated
            USING (public.is_operations_user() OR public.is_lawyer() OR actor_id = auth.uid())';
        EXECUTE 'CREATE POLICY "legal_review_events_insert_lawyer_or_ops" ON public.legal_review_events FOR INSERT TO authenticated
            WITH CHECK (public.is_lawyer() OR public.is_operations_user())';
        EXECUTE 'CREATE POLICY "legal_review_events_delete_privileged" ON public.legal_review_events FOR DELETE TO authenticated
            USING (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 12: INVITATIONS
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invitations') THEN
        EXECUTE 'CREATE POLICY "invitations_all_privileged" ON public.invitations FOR ALL TO authenticated
            USING (public.is_privileged_user()) WITH CHECK (public.is_privileged_user())';
    END IF;
END $$;


-- =============================================================================
-- STEP 13: TABLAS ADMIN-ONLY (config, reports, ad warehousing)
-- =============================================================================

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
            EXECUTE format(
                'CREATE POLICY "%s_admin_only" ON public.%I FOR ALL TO authenticated USING (public.is_privileged_user()) WITH CHECK (public.is_privileged_user())',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;
