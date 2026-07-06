-- =============================================================================
-- SEGURIDAD (Ola 1 DB) — Anti-escalada de privilegios en `profiles`
-- =============================================================================
-- Hallazgo CRÍTICO #2 de la auditoría de seguridad:
--
-- La política RLS "user updates own profile" es
--     FOR UPDATE ... USING (id = auth.uid()) WITH CHECK (id = auth.uid())
-- SIN restricción de columna. Postgres RLS no puede restringir columnas, así que
-- un usuario autenticado (p.ej. 'asesor') puede tomar su propio JWT + la anon key
-- pública y llamar directo a PostgREST:
--     PATCH {SUPABASE_URL}/rest/v1/profiles?id=eq.<su-uid>   body: {"role":"admin"}
-- El WITH CHECK pasa (id = auth.uid()) y queda admin. profiles.role es la fuente
-- de verdad de is_privileged_user()/getUser(), así que esto compromete TODO.
--
-- FIX: trigger BEFORE UPDATE que rechaza cambios en `role`/`is_active` cuando el
-- que hace el cambio es un usuario autenticado NO privilegiado.
--
-- NO rompe funcionalidad legítima:
--   * Los cambios de rol/estado legítimos se hacen server-side con el cliente
--     service-role (app/api/users/[id], /auth/invite, /auth/accept-invite) →
--     en ese contexto auth.uid() = NULL → el trigger NO dispara.
--   * admin/dueno (is_privileged_user() = true) pueden cambiar cualquier perfil.
--   * Un usuario editando su propio nombre/avatar (role/is_active sin cambios) pasa.
--   * Es BEFORE UPDATE: los INSERT de perfiles nuevos (alta por invitación) no se tocan.
--   * El SQL Editor del Dashboard corre sin JWT de usuario (auth.uid()=NULL) → el
--     admin puede seguir corrigiendo roles a mano por SQL.
--
-- Correr en: Supabase Dashboard → SQL Editor (el CLI no conecta en este proyecto).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo interesa cuando cambia una columna sensible de autorización.
  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN

    -- Bloquear solo al usuario autenticado NO privilegiado.
    -- auth.uid() IS NULL  → contexto service-role / servidor / SQL editor → permitido.
    -- is_privileged_user() → admin/dueno → permitido.
    IF auth.uid() IS NOT NULL AND NOT public.is_privileged_user() THEN
      RAISE EXCEPTION
        'No autorizado a modificar role/is_active del perfil %', NEW.id
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Solo authenticated/service ejecutan UPDATE sobre profiles; no hace falta grant extra.
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_profiles_prevent_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- =============================================================================
-- VERIFICACIÓN (correr después, opcional):
--   -- Como asesor (con su JWT), esto DEBE fallar con 42501:
--   --   UPDATE public.profiles SET role='admin' WHERE id = auth.uid();
--   -- Alta por invitación / cambio de is_active por admin (service-role) sigue OK.
-- =============================================================================
