import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

// Solo LECTURA con la sesión del usuario (la RLS acota qué ve). Las escrituras van por
// lib/visitas/datos.ts con service role: desde la migración 20261010000003 la sesión ya no
// puede escribir en property_visits, y un alta/edición por acá además saldría sin
// `changed_by` (el historial quedaría sin actor). Por eso se borraron createVisit/updateVisit.

async function getClient() {
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

export async function listVisits(opts: {
  advisorId?: string
  propertyId?: string
  status?: string
  from?: string
  to?: string
} = {}): Promise<PropertyVisitWithRelations[]> {
  const supabase = await getClient()
  let q = supabase
    .from('property_visits')
    .select(`
      *,
      property:properties(id, address, neighborhood, photos),
      advisor:profiles!property_visits_advisor_id_fkey(id, full_name, email)
    `)
    .order('scheduled_at', { ascending: false })

  if (opts.advisorId) q = q.eq('advisor_id', opts.advisorId)
  if (opts.propertyId) q = q.eq('property_id', opts.propertyId)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.from) q = q.gte('scheduled_at', opts.from)
  if (opts.to) q = q.lte('scheduled_at', opts.to)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as PropertyVisitWithRelations[]
}
