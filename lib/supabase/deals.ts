import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type DealStage = 'scheduled' | 'not_visited' | 'visited' | 'appraisal_sent' | 'followup' | 'captured' | 'lost'

export const DEAL_STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: 'scheduled', label: 'Coordinada', color: 'bg-blue-500' },
  { key: 'not_visited', label: 'No Realizada', color: 'bg-rose-400' },
  { key: 'visited', label: 'Visita Realizada', color: 'bg-amber-500' },
  { key: 'appraisal_sent', label: 'Tasación Entregada', color: 'bg-purple-500' },
  { key: 'followup', label: 'En Seguimiento', color: 'bg-orange-500' },
  { key: 'captured', label: 'Captada', color: 'bg-green-500' },
  { key: 'lost', label: 'Descartado', color: 'bg-red-500' },
]

export interface DealInput {
  contact_id: string
  property_address: string
  scheduled_date?: string
  scheduled_time?: string
  origin?: string
  assigned_to?: string
  created_by?: string
  notes?: string
}

export async function createDeal(input: DealInput) {
  const { data, error } = await getAdmin()
    .from('deals')
    .insert({ ...input, stage: 'scheduled' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function getDeals(filters?: {
  stage?: string; origin?: string; assigned_to?: string; from?: string; to?: string
}) {
  let query = getAdmin()
    .from('deals')
    .select(`
      id, stage, property_address, scheduled_date, scheduled_time,
      origin, assigned_to, appraisal_id, property_id, notes,
      stage_changed_at, created_at,
      contacts:contact_id ( id, full_name, phone, email )
    `)
    .order('created_at', { ascending: false })

  if (filters?.stage) query = query.eq('stage', filters.stage)
  if (filters?.origin) query = query.eq('origin', filters.origin)
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  if (filters?.from) query = query.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters?.to) query = query.lte('created_at', filters.to + 'T23:59:59Z')

  const { data, error } = await query.limit(200)
  if (error) throw error
  return data || []
}

export async function getDeal(id: string) {
  const { data, error } = await getAdmin()
    .from('deals')
    .select(`
      *,
      contacts:contact_id ( * ),
      profiles:assigned_to ( id, full_name, email )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateDealStage(id: string, stage: DealStage, notes?: string) {
  const updates: Record<string, unknown> = {
    stage,
    stage_changed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (notes !== undefined) updates.notes = notes

  const { error } = await getAdmin().from('deals').update(updates).eq('id', id)
  if (error) throw error
}

export async function linkAppraisalToDeal(dealId: string, appraisalId: string) {
  const { error } = await getAdmin()
    .from('deals')
    .update({
      appraisal_id: appraisalId,
      stage: 'appraisal_sent',
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
  if (error) throw error
}

export async function linkPropertyToDeal(dealId: string, propertyId: string) {
  const { error } = await getAdmin()
    .from('deals')
    .update({
      property_id: propertyId,
      stage: 'captured',
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
  if (error) throw error
}
