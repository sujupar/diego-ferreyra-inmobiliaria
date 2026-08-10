import { createClient } from '@supabase/supabase-js'
import type { UserWithProfile } from '@/types/auth.types'
import { alcanceTasaciones } from './appraisal-access'

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
 */
export async function canAccessAppraisal(
  user: UserWithProfile,
  id: string,
): Promise<boolean> {
  const alcance = alcanceTasaciones(user.profile.role)
  // Sin alcance no se consulta ni la fila: el rol no llega a las tasaciones.
  if (alcance === 'ninguna') return false
  if (alcance === 'todas') return true
  const { data } = await admin()
    .from('appraisals')
    .select('assigned_to, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) return false
  const d = data as { assigned_to: string | null; user_id: string | null }
  return d.assigned_to === user.id || d.user_id === user.id
}
