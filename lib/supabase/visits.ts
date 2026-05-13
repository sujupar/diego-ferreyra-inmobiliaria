import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { PropertyVisitInsert, PropertyVisitUpdate, PropertyVisitWithRelations } from '@/types/visits.types'

async function getClient() {
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

export async function createVisit(input: PropertyVisitInsert) {
  const supabase = await getClient()
  const { data, error } = await supabase
    .from('property_visits')
    .insert(input)
    .select('*')
    .single()
  if (error) throw error
  return data
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

export async function getVisit(id: string): Promise<PropertyVisitWithRelations | null> {
  const supabase = await getClient()
  const { data, error } = await supabase
    .from('property_visits')
    .select(`
      *,
      property:properties(id, address, neighborhood, photos),
      advisor:profiles!property_visits_advisor_id_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as PropertyVisitWithRelations | null
}

export async function updateVisit(id: string, patch: PropertyVisitUpdate) {
  const supabase = await getClient()
  const { data, error } = await supabase
    .from('property_visits')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}
