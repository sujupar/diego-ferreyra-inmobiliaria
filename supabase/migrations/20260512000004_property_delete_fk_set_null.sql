-- =============================================================================
-- Migration: permitir borrar propiedades sin que FKs externas bloqueen el delete
-- Date: 2026-05-12
--
-- CONTEXTO
-- --------
-- `DELETE /api/properties/[id]` necesita poder eliminar una propiedad
-- definitivamente. Las FKs declaradas en migraciones (legal_review_events,
-- property_listings, property_metrics_daily, property_publish_events) ya
-- están en CASCADE, pero pueden existir tablas creadas en el dashboard
-- (deals, tasks, etc.) cuyo `property_id` no tenga delete action definido
-- (default NO ACTION/RESTRICT) y bloqueen la operación.
--
-- QUÉ HACE
-- --------
-- 1. Para cada FK pública que referencie `public.properties(id)` y que NO sea
--    ya SET NULL o CASCADE:
--      a. Si la columna es NOT NULL, le saca el NOT NULL.
--      b. Recrea la constraint con ON DELETE SET NULL.
-- 2. Las FKs que ya están CASCADE quedan intactas (deletes hijos junto).
-- 3. Las FKs que ya están SET NULL también quedan intactas.
--
-- POR QUÉ SET NULL Y NO CASCADE
-- -----------------------------
-- Para tablas no controladas (creadas en dashboard) no podemos asumir que
-- cascade-borrar sus rows sea seguro: por ejemplo, un `deal` puede tener
-- historia comercial que queremos conservar aunque la propiedad se borre.
-- SET NULL preserva el row referenciante y solo desliga la referencia.
--
-- Si en el futuro querés que una tabla específica cascade-borre, hacelo
-- manualmente (ALTER … ON DELETE CASCADE) — esta migración no la pisa.
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
          AND refcls.relname = 'properties'
          AND array_length(con.conkey, 1) = 1
          AND con.confdeltype NOT IN ('n', 'c')  -- skip si ya es SET NULL o CASCADE
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
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.properties(id) ON DELETE SET NULL',
            r.schema_name, r.table_name, r.constraint_name, r.column_name
        );

        RAISE NOTICE 'Updated FK %.%.% → properties(id) to ON DELETE SET NULL',
            r.schema_name, r.table_name, r.column_name;
    END LOOP;
END $$;

-- =============================================================================
-- Verificación (descomentar):
-- =============================================================================
-- SELECT
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
--   AND refcls.relname = 'properties'
-- ORDER BY cls.relname, att.attname;
