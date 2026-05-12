-- =============================================================================
-- Migration: permitir borrar usuarios sin que FKs bloqueen la cascade
-- Date: 2026-05-12
--
-- CONTEXTO
-- --------
-- `DELETE /api/users/[id]` llama a `supabase.auth.admin.deleteUser(id)`.
-- Eso borra de `auth.users` → cascade a `public.profiles` → falla porque
-- varias tablas (contacts, scheduled_appraisals, deals, properties, etc.)
-- tienen FKs hacia `profiles(id)` SIN `ON DELETE SET NULL` (default: NO
-- ACTION), entonces bloquean la cascade.
--
-- Resultado visible: la UI muestra "Database error deleting user" y la API
-- devuelve 500.
--
-- La intención del flujo (ver users-client.tsx) ya es que los registros
-- queden huérfanos ("Sus deals, tasaciones y propiedades quedarán
-- huérfanos"), entonces SET NULL es la semántica correcta.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- -----------------------
-- 1. Encuentra TODAS las FKs en schema `public` que referencian
--    `public.profiles(id)` y que NO sean ya SET NULL ni CASCADE.
-- 2. Si la columna es NOT NULL, le saca el NOT NULL (SET NULL requiere
--    columna nullable).
-- 3. Recrea la constraint con `ON DELETE SET NULL`.
--
-- Idempotente: re-ejecutar es seguro (skipea las que ya están SET NULL).
--
-- INSTRUCCIONES
-- -------------
-- Pegar todo en Supabase Dashboard → SQL Editor → Run.
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
          AND refcls.relname = 'profiles'
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
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE SET NULL',
            r.schema_name, r.table_name, r.constraint_name, r.column_name
        );

        RAISE NOTICE 'Updated FK %.%.% → profiles(id) to ON DELETE SET NULL',
            r.schema_name, r.table_name, r.column_name;
    END LOOP;
END $$;

-- =============================================================================
-- Verificación (descomentar para correr ad-hoc).
-- Debería listar todas las FKs a profiles(id) y su delete_action.
-- Todas las que NO sean CASCADE deberían quedar como SET NULL.
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
--   AND refcls.relname = 'profiles'
-- ORDER BY cls.relname, att.attname;
