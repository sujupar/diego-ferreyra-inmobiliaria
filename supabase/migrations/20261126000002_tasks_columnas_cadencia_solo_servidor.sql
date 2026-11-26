-- crm-ficha-y-llamadas (design.md D1, hallazgo S1 de la revisión 12.1): las columnas
-- `tasks.source_activity_id` y `tasks.closed_by_activity_id` las escribe SOLO el servidor
-- (cliente de servicio). Las policies viejas de `tasks` (20260505000001) dejan insertar a
-- cualquier sesión (`WITH CHECK (true)`) y editar al asignado; sin esta guarda, una sesión
-- propia por la API REST podía crear una tarea "de la cadencia" (y ocupar el índice único
-- `uq_tasks_source_activity` de un intento ajeno, con lo que la cadencia no crea la tarea
-- real) o marcar una tarea como cerrada por una actividad que no la cerró.
--
-- No se tocan las policies (`tasks` es camino crítico): la guarda es un trigger BEFORE que
-- solo valida NEW y no escribe otras tablas.
--
-- Quién queda afuera: un pedido con JWT cuyo rol no es `service_role` (PostgREST con la
-- sesión del usuario o anónima), o que corre como los roles `authenticated`/`anon`.
-- Quién pasa: el cliente de servicio, y una conexión directa a la base sin JWT (scripts de
-- mantenimiento con la contraseña de la base).
--
-- Excepción: la acción de las FK `ON DELETE SET NULL` (borrar una actividad o un contacto
-- con sus actividades) pone esas columnas en NULL desde un trigger interno de Postgres, con
-- el JWT de quien borró. Eso no es una escritura del usuario: se reconoce por
-- `pg_trigger_depth() > 1` (el trigger corre anidado en el de la FK) y se deja pasar. Sin
-- esa excepción, borrar un contacto con tareas de la cadencia fallaría.
--
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS. Lo aplica y verifica
-- `scripts/apply-tasks-cadencia-solo-servidor-pg.ts`.

CREATE OR REPLACE FUNCTION public.tasks_columnas_cadencia_solo_servidor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  rol_jwt text := auth.role();
  es_usuario boolean;
BEGIN
  -- Acción de una FK (SET NULL) o de otro trigger: no es una escritura directa.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  es_usuario := current_user IN ('authenticated', 'anon')
             OR (rol_jwt IS NOT NULL AND rol_jwt <> 'service_role');
  IF NOT es_usuario THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.source_activity_id IS NOT NULL OR NEW.closed_by_activity_id IS NOT NULL THEN
      RAISE EXCEPTION 'Las columnas source_activity_id y closed_by_activity_id de tasks las escribe solo el servidor'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.source_activity_id IS DISTINCT FROM OLD.source_activity_id
     OR NEW.closed_by_activity_id IS DISTINCT FROM OLD.closed_by_activity_id THEN
    RAISE EXCEPTION 'Las columnas source_activity_id y closed_by_activity_id de tasks las escribe solo el servidor'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_columnas_cadencia_solo_servidor ON public.tasks;
CREATE TRIGGER trg_tasks_columnas_cadencia_solo_servidor
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_columnas_cadencia_solo_servidor();
