import { createClient } from '@supabase/supabase-js'
import type { UserWithProfile } from '@/types/auth.types'

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
 */
export async function canAccessAppraisal(
  user: UserWithProfile,
  id: string,
): Promise<boolean> {
  if (user.profile.role !== 'asesor') return true
  const { data } = await admin()
    .from('appraisals')
    .select('assigned_to, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) return false
  const d = data as { assigned_to: string | null; user_id: string | null }
  return d.assigned_to === user.id || d.user_id === user.id
}
