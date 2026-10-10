/**
 * Quién usa el asistente de una tasación: el mismo par de candados que escribir
 * la tasación (el rol escribe tasaciones Y esta cae en su alcance). Así el
 * abogado, que solo lee tasaciones vinculadas, no lo ve (spec 2026-10-03).
 */
import { canAccessAppraisal } from '../auth/entity-access'
import { puedeEditarTasacion } from '../auth/appraisal-access'
import type { UserWithProfile } from '../../types/auth.types'

export async function puedeUsarAsistente(user: UserWithProfile, appraisalId: string): Promise<boolean> {
    if (!puedeEditarTasacion(user.profile.role)) return false
    return canAccessAppraisal(user, appraisalId)
}
