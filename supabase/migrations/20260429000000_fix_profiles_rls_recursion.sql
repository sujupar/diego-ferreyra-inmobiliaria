-- =============================================================================
-- Migration: Fix infinite recursion in profiles RLS policies
-- Date: 2026-04-29
--
-- PROBLEMA
-- --------
-- El error "42P17: infinite recursion detected in policy for relation 'profiles'"
-- aparece cuando una policy de `profiles` hace una subquery a la propia tabla
-- `profiles` para verificar el rol del usuario actual. Ej:
--
--     CREATE POLICY "admin manage profiles" ON profiles
--     USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'dueno'));
--
-- Esa subquery también está sujeta a las policies de `profiles` → recursión infinita.
--
-- Cualquier UPDATE/SELECT que toque `appraisals` con FK hacia `profiles` (ej.
-- assigned_to, user_id) intenta evaluar las policies de `profiles` y dispara
-- la recursión, devolviendo 500 al cliente.
--
-- SOLUCIÓN ESTÁNDAR DE SUPABASE
-- -----------------------------
-- Crear una función SECURITY DEFINER que consulta `profiles` SALTÁNDOSE RLS
-- (porque corre con privilegios del owner), y usarla dentro de las policies.
-- Así la policy NO hace una subquery sujeta a sí misma.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar el contenido de este archivo y ejecutar.
-- 3. Verificar que las policies actualizadas no tengan subqueries a `profiles`
--    sin la helper function.
-- 4. Test: editar una tasación. El error 42P17 debe desaparecer.
-- =============================================================================

-- Step 1: helper function que devuelve el rol del usuario actual sin RLS recursion.
-- SECURITY DEFINER hace que la función corra con privilegios del owner (postgres),
-- bypassando las policies de profiles. STABLE permite caching dentro de la query.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Step 2: helper que devuelve true si el usuario es admin/dueño (acceso completo).
CREATE OR REPLACE FUNCTION public.is_privileged_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'dueno') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Step 3: revocar grants públicos a estas helpers (solo authenticated users las llaman).
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_privileged_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_privileged_user() TO authenticated;

-- Step 4: dropear todas las policies actuales de `profiles` y recrearlas
-- usando los helpers en lugar de subqueries inline.
--
-- IMPORTANTE: ajustar los nombres exactos de policies en el bloque a continuación
-- según lo que tenga tu DB. Ejecutá primero esto para ver las policies actuales:
--
--   SELECT polname FROM pg_policy
--   WHERE polrelid = 'public.profiles'::regclass;
--
-- Luego DROPea cada una por nombre y recrea con la versión correcta.

-- Versión genérica que cubre los nombres más comunes que Supabase suele autogenerar.
-- Si tu DB tiene otros nombres, ajustar manualmente.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy WHERE polrelid = 'public.profiles'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.polname);
  END LOOP;
END $$;

-- Step 5: recrear policies SIN recursión.

-- 5a) Cualquier authenticated user puede LEER su propio profile + los profiles
--     de otros usuarios (necesario para ver "asignado a", listas de asesores, etc).
--     La lectura del role del JWT NO requiere RLS porque está en el token.
CREATE POLICY "authenticated read profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 5b) Solo el dueño del registro puede UPDATE su propio profile.
CREATE POLICY "user updates own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 5c) Admin/dueño puede UPDATE cualquier profile (vía helper, sin recursión).
CREATE POLICY "admin updates any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_privileged_user())
  WITH CHECK (public.is_privileged_user());

-- 5d) Admin/dueño puede INSERT profiles (típicamente vía trigger handle_new_user
--     pero también desde la UI de invitaciones).
CREATE POLICY "admin inserts profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_privileged_user());

-- 5e) Admin/dueño puede DELETE profiles.
CREATE POLICY "admin deletes profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_privileged_user());

-- =============================================================================
-- VERIFICACIÓN POST-APLICACIÓN
-- =============================================================================
-- Ejecutar:
--
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--   FROM pg_policy WHERE polrelid = 'public.profiles'::regclass;
--
-- Cada policy debe usar `is_privileged_user()` o `auth.uid()`, NUNCA un
-- `(SELECT ... FROM profiles ...)` dentro de USING/WITH CHECK.
--
-- Test final desde la app:
-- 1. Editar una tasación con propiedad de compra.
-- 2. Cambiar un valor.
-- 3. Verificar en consola que NO aparece "42P17 infinite recursion".
-- 4. El indicador "Guardado en historial" debe aparecer en verde.
-- =============================================================================
