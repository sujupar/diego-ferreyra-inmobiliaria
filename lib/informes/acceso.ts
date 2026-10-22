import 'server-only'
/**
 * Quién ve y edita los informes de una propiedad (spec, "Qué ve cada persona"): operaciones
 * (admin, dueño, coordinadora) todos; el asesor, los de las propiedades que muestra o que captó
 * (`puedeGestionarMedia`, el mismo criterio que el material de la propiedad); el abogado ninguno.
 * El menú NO es la barrera: esto corre en cada ruta.
 */
import { getUser } from '@/lib/auth/get-user'
import { puedeGestionarMedia } from '@/lib/properties/acceso-media'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Autorizacion = { ok: true; userId: string; rol: string } | { ok: false; status: 401 | 403 | 404; error: string }

export async function autorizarInformesDe(propertyId: string): Promise<Autorizacion> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, status: 401, error: 'Iniciá sesión de nuevo' }
  if (user.profile.role === 'abogado') return { ok: false, status: 403, error: 'Los informes no están disponibles para tu rol' }
  if (!UUID_RE.test(propertyId)) return { ok: false, status: 404, error: 'No encontramos la propiedad' }
  if (!(await puedeGestionarMedia(user, propertyId))) return { ok: false, status: 403, error: 'Solo quien gestiona la propiedad puede ver sus informes' }
  return { ok: true, userId: user.id, rol: String(user.profile.role) }
}

export function esUuid(v: string): boolean {
  return UUID_RE.test(v)
}
