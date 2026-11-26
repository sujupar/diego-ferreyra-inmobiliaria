import { createClient } from '@supabase/supabase-js'
import type { UserWithProfile } from '@/types/auth.types'
import { alcanceTasaciones } from './appraisal-access'
import { alcanceContactos, puedeVerContacto } from './contact-access'

/**
 * Autorización a nivel de objeto (anti-IDOR) consistente con el resto del sistema
 * (leads/[id] authorize(), ml-preview authorize()) y con ROLE_PERMISSIONS:
 *
 *   - admin / dueno / coordinador / abogado  → acceso amplio (view_all): sin cambio
 *     de comportamiento respecto de hoy. Devuelven true de inmediato.
 *   - asesor  → SOLO filas asignadas a él (properties.manage / pipeline.view_own).
 *
 * Falla cerrado: si la fila no existe → false (deny). Usa el cliente service-role
 * SOLO para leer la columna de ownership (nunca para autorizar por sí mismo).
 *
 * OJO: lo de arriba vale para PROPIEDADES y PROCESOS. Las TASACIONES tienen su
 * propia lista de roles (`lib/auth/appraisal-access.ts`) porque el abogado no
 * tiene ningún permiso de tasación — ver `canAccessAppraisal` abajo.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** properties/deals: ownership = assigned_to === user.id (para el rol asesor). */
export async function canAccessOwned(
  user: UserWithProfile,
  table: 'properties' | 'deals',
  id: string,
): Promise<boolean> {
  if (user.profile.role !== 'asesor') return true
  const { data } = await admin().from(table).select('assigned_to').eq('id', id).maybeSingle()
  if (!data) return false
  return (data as { assigned_to: string | null }).assigned_to === user.id
}

export function canAccessProperty(user: UserWithProfile, id: string) {
  return canAccessOwned(user, 'properties', id)
}

export function canAccessDeal(user: UserWithProfile, id: string) {
  return canAccessOwned(user, 'deals', id)
}

/**
 * ¿Hay alguna propiedad que apunte a esta tasación?
 *
 * Es el vínculo del alcance `vinculadas` (hoy: el abogado). Se resuelve por
 * `properties.appraisal_id`, la columna que escribe el alta de propiedad
 * (`/properties/new` la copia del proceso o de la tasación agendada de la que
 * nació la ficha). Se eligió ese camino, y no `deals.property_id` +
 * `deals.appraisal_id`, porque contra la base real es un SUPERCONJUNTO del
 * otro: de 32 propiedades, 8 tienen `appraisal_id` propio y solo 6 llegan
 * también por la vuelta del proceso; donde los dos caminos existen apuntan a la
 * MISMA tasación (6 de 6, cero discrepancias) y no hay ninguna propiedad que
 * llegue solo por el deal. Además `deals.property_id` está cargado en 7 de 819
 * procesos: atravesar el deal perdería propiedades sin ganar ninguna.
 *
 * FALLA CERRADO por partida doble: sin `id` no se consulta, y un error de la
 * consulta (red, RLS, tabla ausente) devuelve `false` — nunca se asume que el
 * vínculo existe porque no se pudo mirar.
 *
 * OJO: acá alcanza con que la propiedad EXISTA, sin filtrar por pertenencia,
 * porque todo rol con alcance `vinculadas` tiene `properties.view_all` (o sea,
 * las revisa todas). Ese requisito lo verifica el test de `appraisal-access`:
 * si alguna vez se le diera este alcance a un rol con acceso PARCIAL a
 * propiedades, hay que filtrar también acá.
 */
async function tasacionVinculadaAPropiedad(id: string): Promise<boolean> {
  if (!id) return false
  const { data, error } = await admin()
    .from('properties')
    .select('id')
    .eq('appraisal_id', id)
    // Varias propiedades pueden compartir tasación (pasa en la base real, con
    // las fichas duplicadas del import). El `limit(1)` evita que `maybeSingle`
    // reviente con "more than one row" y termine negando un vínculo que existe.
    .limit(1)
    .maybeSingle()
  if (error) return false
  return !!data
}

/**
 * appraisals: ownership = assigned_to === user.id OR user_id === user.id.
 * Espeja el scoping del listado en /api/appraisals (query .or(assigned_to,user_id))
 * — una tasación puede tener assigned_to nulo pero user_id del asesor que la creó.
 *
 * D1 (crítico): antes empezaba con `if (user.profile.role !== 'asesor') return true`.
 * Escrito así, TODO rol que no fuera asesor pasaba — incluido el `abogado`, que no
 * tiene ni un permiso `appraisal.*` y que por esta puerta podía leer, editar y
 * BORRAR DEFINITIVAMENTE cualquier tasación (las rutas usan service role, así que
 * la RLS no lo frenaba). Ahora la lista de roles es explícita y falla cerrado:
 * ver `lib/auth/appraisal-access.ts`.
 *
 * OJO: esta función responde "¿ESTA tasación cae dentro de su alcance?", no
 * "¿este rol la puede escribir?". Con el alcance `vinculadas` las dos preguntas
 * dejaron de tener la misma respuesta, así que el PUT/PATCH/DELETE llevan
 * ADEMÁS el candado de capacidad (`puedeEditarTasacion`/`puedeBorrarTasacion`).
 */
export async function canAccessAppraisal(
  user: UserWithProfile,
  id: string,
): Promise<boolean> {
  const alcance = alcanceTasaciones(user.profile.role)
  // Sin alcance no se consulta ni la fila: el rol no llega a las tasaciones.
  if (alcance === 'ninguna') return false
  if (alcance === 'todas') return true
  if (alcance === 'vinculadas') return tasacionVinculadaAPropiedad(id)
  const { data } = await admin()
    .from('appraisals')
    .select('assigned_to, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) return false
  const d = data as { assigned_to: string | null; user_id: string | null }
  return d.assigned_to === user.id || d.user_id === user.id
}

/**
 * contacts (design.md D2): operaciones ve todo; el asesor, si el contacto está asignado
 * o lo creó él, o si tiene un proceso o una tasación de ese contacto a su nombre; el
 * resto de los roles, nada. Hasta tres lecturas cortas, cortando en la primera que da
 * acceso. FALLA CERRADO: un error de lectura devuelve `false` (nunca se asume el vínculo
 * porque no se pudo mirar), y un contacto inexistente también.
 *
 * OJO: mira solo `deals.assigned_to`, no `deals.created_by`. `PATCH /api/deals/[id]/contact`
 * acepta también al creador del proceso como dueño; no se unifican a propósito (D2):
 * ampliarlo daría acceso a contactos de procesos que el asesor ya no lleva.
 */
export async function canAccessContact(user: UserWithProfile, id: string): Promise<boolean> {
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'todos') return true
  if (alcance === 'ninguno' || !id) return false
  const u = { id: user.id, role: user.profile.role }
  const vinculos = { assigned_to: null, created_by: null, asesoresDeProcesos: [], asesoresDeTasaciones: [] }
  const db = admin()

  const { data: contacto, error: errorContacto } = await db
    .from('contacts')
    .select('assigned_to, created_by')
    .eq('id', id)
    .maybeSingle()
  if (errorContacto || !contacto) return false
  const c = contacto as { assigned_to: string | null; created_by: string | null }
  if (puedeVerContacto(u, { ...vinculos, assigned_to: c.assigned_to, created_by: c.created_by })) return true

  const { data: proceso, error: errorProceso } = await db
    .from('deals')
    .select('assigned_to')
    .eq('contact_id', id)
    .eq('assigned_to', user.id)
    .limit(1)
    .maybeSingle()
  if (errorProceso) return false
  if (proceso) {
    const p = proceso as { assigned_to: string | null }
    if (puedeVerContacto(u, { ...vinculos, asesoresDeProcesos: [p.assigned_to] })) return true
  }

  const { data: tasacion, error: errorTasacion } = await db
    .from('appraisals')
    .select('assigned_to, user_id')
    .eq('contact_id', id)
    .or(`assigned_to.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle()
  if (errorTasacion || !tasacion) return false
  const t = tasacion as { assigned_to: string | null; user_id: string | null }
  return puedeVerContacto(u, { ...vinculos, asesoresDeTasaciones: [t.assigned_to, t.user_id] })
}
