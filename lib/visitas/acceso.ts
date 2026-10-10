/**
 * Quién puede hacer qué con las visitas. Una sola regla para la ruta y la
 * pantalla (el menú NO es la barrera: la barrera es el servidor).
 * Un rol desconocido cae del lado seguro (mismo criterio que lib/auth/scope.ts:
 * `hasPermission` explota con un rol fuera del catálogo).
 */
import { hasPermission, type Permission } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'
import type { TipoAccion } from './transiciones'

function permiso(role: Role, p: Permission): boolean {
  try {
    return hasPermission(role, p)
  } catch {
    return false
  }
}

export function puedeGestionarVisitas(role: Role): boolean {
  return permiso(role, 'pipeline.schedule')
}

export function puedeVerTodasLasVisitas(role: Role): boolean {
  return permiso(role, 'pipeline.view_all')
}

export function puedeVerVisita(
  role: Role,
  userId: string,
  visita: { advisor_id: string | null; created_by: string | null },
): boolean {
  if (!puedeGestionarVisitas(role)) return false
  if (puedeVerTodasLasVisitas(role)) return true
  return visita.advisor_id === userId || visita.created_by === userId
}

/**
 * Las acciones que calcula `accionesDisponibles` (lib/visitas/transiciones.ts)
 * son sobre la VISITA, sin noción de quién mira — "cambiar_asesor" sale ahí
 * si la visita todavía admite cambios, no si quien pregunta puede hacerlo.
 * Filtro final por rol antes de mandar la lista a la pantalla/respuesta.
 */
export function accionesParaRol(acciones: TipoAccion[], role: Role): TipoAccion[] {
  if (puedeVerTodasLasVisitas(role)) return acciones
  return acciones.filter(a => a !== 'cambiar_asesor')
}

export function asesorParaLaVisita(
  role: Role,
  userId: string,
  pedido: string | null | undefined,
): { ok: true; asesorId: string; esPropio: boolean } | { ok: false; error: string } {
  if (!puedeVerTodasLasVisitas(role)) return { ok: true, asesorId: userId, esPropio: true }
  const elegido = pedido?.trim()
  if (!elegido) return { ok: false, error: 'Elegí el asesor que va a mostrar la propiedad' }
  return { ok: true, asesorId: elegido, esPropio: elegido === userId }
}
