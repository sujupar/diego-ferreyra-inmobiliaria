-- =============================================================================
-- Migration: permitir borrar deals (procesos comerciales) sin que FKs externas bloqueen
-- Date: 2026-05-13
--
-- CONTEXTO
-- --------
-- `DELETE /api/deals/[id]` necesita ejecutarse sin que `tasks.deal_id` u otras
-- columnas que apunten a `deals(id)` (creadas en dashboard, sin política
-- definida) aborten la operación.
--
-- QUÉ HACE
-- --------
-- Para cada FK pública que apunte a `public.deals(id)` y que NO sea ya
-- SET NULL ni CASCADE:
--   1. Si la columna es NOT NULL, le saca el NOT NULL.
--   2. Recrea la constraint con ON DELETE SET NULL.
--
-- Idempotente. Pegar en Supabase Dashboard → SQL Editor → Run.
-- =============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
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
          AND refcls.relname = 'deals'
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
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.deals(id) ON DELETE SET NULL',
            r.schema_name, r.table_name, r.constraint_name, r.column_name
        );

        RAISE NOTICE 'Updated FK %.%.% → deals(id) to ON DELETE SET NULL',
            r.schema_name, r.table_name, r.column_name;
    END LOOP;
END $$;
