import { Role } from '@/types/auth.types'
import { Permission, ROLE_PERMISSIONS } from './roles'

/**
 * Alcance del filtro por asignación en los listados del CRM: `assigned_to` en
 * deals y contactos, y `user_id` en tareas (que en la base también es la columna
 * `tasks.assigned_to` — `getMyTasks` filtra por ahí).
 *
 * POR QUÉ EXISTE: las tres rutas leen con el cliente service-role, así que RLS
 * NO aplica — la base no acota nada. El "ver solo lo mío" vivía únicamente en
 * la pantalla (`if (role === 'asesor') params.set('assigned_to', mi_id)`), y un
 * `if` del navegador protege el camino de la interfaz, no el deliberado: con
 * una sesión válida alcanzaba con `fetch('/api/deals?assigned_to=<id ajeno>')`
 * para leer los deals de otro asesor con el teléfono y el email del contacto.
 *
 * LA REGLA: quien NO tiene `pipeline.view_all` queda forzado a su propio id, se
 * ignore lo que venga en la dirección. Quien SÍ lo tiene conserva el filtro por
 * asesor tal cual lo pide la pantalla.
 *
 * SE DECIDE POR PERMISO, NO POR NOMBRE DE ROL: es la abstracción que el
 * proyecto ya tiene, y un rol nuevo hereda el comportamiento correcto sin que
 * nadie tenga que acordarse de volver acá. Hoy tienen `pipeline.view_all`
 * admin, dueño y coordinador; asesor y el legacy agent tienen `pipeline.view_own`;
 * abogado y viewer no tienen ninguno de los dos — y para esos dos, acotar a su
 * propio id es exactamente lo correcto.
 *
 * `pipeline.view_all` NO es una elección estética: reproduce exactamente el
 * `is_operations_user()` (admin/dueño/coordinador) que la propia base usa en las
 * policies de estas tablas — `tasks_select_assigned_or_ops` es literalmente
 * `assigned_to = auth.uid() OR is_operations_user()`. La ruta queda alineada con
 * la RLS que el service-role saltea, en vez de inventar una regla paralela.
 *
 * NO SIRVE PARA `properties`: ahí la base abrió el SELECT a propósito
 * (`properties_select_all_authenticated ... USING (true)`, migración
 * `20260513000003_properties_rls_marketplace.sql`) porque el listado es un
 * catálogo tipo marketplace y el "solo mías" es un filtro de pantalla, no un
 * límite de seguridad. Forzar alcance ahí rompería el catálogo del asesor sin
 * cerrar nada.
 *
 * FAIL-CLOSED en los dos bordes: un rol que no figure en el catálogo de
 * permisos queda acotado (no ensanchado), y si no se puede determinar el id del
 * usuario se lanza en vez de devolver `undefined`, porque `undefined` significa
 * "sin filtro" — o sea, el volcado completo que estamos cerrando.
 */
export function resolverAlcanceAsignado(
  role: Role,
  userId: string | null | undefined,
  solicitado: string | null | undefined,
): string | undefined {
  if (puedeVerTodo(role)) {
    const pedido = solicitado?.trim()
    return pedido ? pedido : undefined
  }
  const propio = userId?.trim()
  if (!propio) {
    throw new Error('No se pudo determinar el alcance del usuario')
  }
  return propio
}

/**
 * `hasPermission` explota (TypeError) si el rol no está en el catálogo, y acá
 * un rol desconocido tiene que caer del lado seguro, no romper el listado.
 */
function puedeVerTodo(role: Role): boolean {
  const permisos: Permission[] | undefined = ROLE_PERMISSIONS[role]
  if (!permisos) return false
  return permisos.includes('pipeline.view_all')
}
