import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ¿Se le puede asignar un proceso a este usuario? Solo a un asesor o dueño
 * ACTIVO: asignárselo a alguien dado de baja, o a un abogado, lo dejaría otra
 * vez sin dueño real. Los roles son los mismos que ofrece
 * `GET /api/users/advisors`. La usan reasignar (`PUT /api/deals/[id]`) y
 * completar los datos del cliente (`PUT /api/deals/[id]/cliente`).
 */
export async function esAsesorAsignable(db: SupabaseClient, profileId: string): Promise<boolean> {
  const { data } = await db.from('profiles').select('id, role, is_active').eq('id', profileId).maybeSingle()
  const p = data as { role?: string; is_active?: boolean } | null
  return !!p && !!p.is_active && ['asesor', 'dueno'].includes(p.role ?? '')
}
