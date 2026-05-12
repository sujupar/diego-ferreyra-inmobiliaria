-- =============================================================================
-- Migration: permitir borrar contacts y appraisals sin que FKs externas bloqueen
-- Date: 2026-05-12
--
-- CONTEXTO
-- --------
-- `DELETE /api/contacts/[id]` y `DELETE /api/appraisals/[id]` necesitan poder
-- ejecutarse sin que FKs sin política definida (deals, tasks, scheduled_
-- appraisals, properties, appraisals.contact_id, etc.) aborten la operación.
--
-- Las FKs internas hijas (appraisal_comparables, comparables, property_images)
-- ya cascadean desde el initial_schema y appraisals_v2 — no se tocan.
--
-- QUÉ HACE
-- --------
-- Para cada FK pública que apunte a `public.contacts(id)` o `public.appraisals(id)`
-- y que NO sea ya SET NULL ni CASCADE:
--   1. Si la columna es NOT NULL, le saca el NOT NULL.
--   2. Recrea la constraint con ON DELETE SET NULL.
--
-- Idempotente. Pegar en Supabase Dashboard → SQL Editor → Run.
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    targets text[] := ARRAY['contacts', 'appraisals'];
    target text;
BEGIN
    FOREACH target IN ARRAY targets LOOP
        FOR r IN
            SELECT
                con.conname         AS constraint_name,
                n.nspname           AS schema_name,
                cls.relname         AS table_name,
                att.attname         AS column_name,
                att.attnotnull      AS is_not_null
            FROM pg_constraint con
            JOIN pg_class cls       ON cls.oid = con.conrelid
            JOIN pg_namespace n     ON n.oid = cls.relnamespace
            JOIN pg_class refcls    ON refcls.oid = con.confrelid
            JOIN pg_namespace refn  ON refn.oid = refcls.relnamespace
            JOIN pg_attribute att   ON att.attrelid = con.conrelid
                                    AND att.attnum = ANY(con.conkey)
            WHERE con.contype = 'f'
              AND n.nspname = 'public'
              AND refn.nspname = 'public'
              AND refcls.relname = target
              AND array_length(con.conkey, 1) = 1
              AND con.confdeltype NOT IN ('n', 'c')
        LOOP
            IF r.is_not_null THEN
                EXECUTE format(
                    'ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL',
                    r.schema_name, r.table_name, r.column_name
                );
                RAISE NOTICE 'Dropped NOT NULL on %.%.%',
                    r.schema_name, r.table_name, r.column_name;
            END IF;

            EXECUTE format(
                'ALTER TABLE %I.%I DROP CONSTRAINT %I',
                r.schema_name, r.table_name, r.constraint_name
            );
            EXECUTE format(
                'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE SET NULL',
                r.schema_name, r.table_name, r.constraint_name, r.column_name, target
            );

            RAISE NOTICE 'Updated FK %.%.% → %(id) to ON DELETE SET NULL',
                r.schema_name, r.table_name, r.column_name, target;
        END LOOP;
    END LOOP;
END $$;

-- =============================================================================
-- Verificación (descomentar):
-- =============================================================================
-- SELECT
--     refcls.relname || '(id)' AS target,
--     n.nspname || '.' || cls.relname AS table_,
--     att.attname AS column_,
--     CASE con.confdeltype
--         WHEN 'a' THEN 'NO ACTION'
--         WHEN 'r' THEN 'RESTRICT'
--         WHEN 'c' THEN 'CASCADE'
--         WHEN 'n' THEN 'SET NULL'
--         WHEN 'd' THEN 'SET DEFAULT'
--     END AS delete_action
-- FROM pg_constraint con
-- JOIN pg_class cls ON cls.oid = con.conrelid
-- JOIN pg_namespace n ON n.oid = cls.relnamespace
-- JOIN pg_class refcls ON refcls.oid = con.confrelid
-- JOIN pg_namespace refn ON refn.oid = refcls.relnamespace
-- JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
-- WHERE con.contype = 'f'
--   AND refn.nspname = 'public'
--   AND refcls.relname IN ('contacts', 'appraisals')
-- ORDER BY refcls.relname, cls.relname, att.attname;
