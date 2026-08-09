import { Role } from '@/types/auth.types'
import { Permission, ROLE_PERMISSIONS } from './roles'

/**
 * Alcance del filtro `assigned_to` en los listados del CRM (deals y contactos).
 *
 * POR QUÉ EXISTE: las dos rutas leen con el cliente service-role, así que RLS
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
