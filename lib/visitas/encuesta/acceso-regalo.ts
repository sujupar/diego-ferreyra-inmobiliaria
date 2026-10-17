import 'server-only'
/**
 * Quién puede cargar/ver/quitar el regalo de una propiedad (adenda §11.2): el mismo criterio que el
 * material de la propiedad (`puedeGestionarMedia`: operaciones, el asesor asignado o el que la
 * captó). El abogado nunca (no ve visitas). El menú NO es la barrera: esto corre en cada ruta.
 */
import { getUser } from '@/lib/auth/get-user'
import { puedeGestionarMedia } from '@/lib/properties/acceso-media'
import { hasPermission } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Autorizacion = { ok: true; userId: string } | { ok: false; status: 401 | 403 | 404; error: string }

export async function autorizarRegalo(propertyId: string): Promise<Autorizacion> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, status: 401, error: 'Iniciá sesión de nuevo' }
  if (user.profile.role === 'abogado') return { ok: false, status: 403, error: 'El regalo no está disponible para tu rol' }
  if (!UUID_RE.test(propertyId)) return { ok: false, status: 404, error: 'No encontramos la propiedad' }
  if (!(await puedeGestionarMedia(user, propertyId))) {
    return { ok: false, status: 403, error: 'Solo quien gestiona la propiedad puede cargar el regalo' }
  }
  return { ok: true, userId: user.id }
}

/**
 * Regalo GENERAL (2026-10-17). VERLO: todo el equipo menos el abogado (la ficha avisa que se está
 * usando; es material que se le da a cualquier cliente, no un dato sensible). CARGARLO, REEMPLAZARLO
 * O QUITARLO: solo `settings.manage` (admin y dueño), porque cambia lo que reciben TODAS las visitas.
 */
export async function autorizarRegaloGeneral(modo: 'ver' | 'administrar'): Promise<Autorizacion> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, status: 401, error: 'Iniciá sesión de nuevo' }
  if (user.profile.role === 'abogado') return { ok: false, status: 403, error: 'El regalo no está disponible para tu rol' }
  if (modo === 'administrar') {
    let puede = false
    try { puede = hasPermission(user.profile.role as Role, 'settings.manage') } catch { puede = false }
    if (!puede) return { ok: false, status: 403, error: 'Solo admin y dueño pueden cambiar el regalo general' }
  }
  return { ok: true, userId: user.id }
}
