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
  property_type: 'departamento' | 'casa' | 'ph' | 'otro'
  property_type_other?: string | null
  neighborhood: string
  rooms: number
  covered_area?: number | null
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
  stage?: string; origin?: string; assigned_to?: string; from?: string; to?: string;
  limit?: number; offset?: number;
}) {
  const limit = filters?.limit ?? 50
  const offset = filters?.offset ?? 0

  function applyFilters<T>(q: T): T {
    let query = q as any
    if (filters?.stage) query = query.eq('stage', filters.stage)
    if (filters?.origin) query = query.eq('origin', filters.origin)
    if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
    if (filters?.from) query = query.gte('created_at', filters.from + 'T00:00:00Z')
    if (filters?.to) query = query.lte('created_at', filters.to + 'T23:59:59Z')
    return query as T
  }

  const dataQuery = applyFilters(
    getAdmin()
      .from('deals')
      .select(`
        id, stage, property_address, property_type, neighborhood, rooms,
        scheduled_date, scheduled_time,
        origin, assigned_to, appraisal_id, property_id, notes,
        stage_changed_at, created_at,
        contacts:contact_id ( id, full_name, phone, email )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
  )
  const { data, error, count } = await dataQuery.range(offset, offset + limit - 1)
  if (error) throw error

  // stageCounts — all stages (not filtered by stage, but filtered by other filters)
  const countQuery = getAdmin().from('deals').select('stage')
  let cq = countQuery
  if (filters?.origin) cq = cq.eq('origin', filters.origin)
  if (filters?.assigned_to) cq = cq.eq('assigned_to', filters.assigned_to)
  if (filters?.from) cq = cq.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters?.to) cq = cq.lte('created_at', filters.to + 'T23:59:59Z')
  const { data: stageRows, error: stageErr } = await cq
  if (stageErr) throw stageErr

  const stageCounts: Record<string, number> = {}
  for (const row of stageRows || []) {
    stageCounts[row.stage] = (stageCounts[row.stage] || 0) + 1
  }

  return { data: data || [], total: count ?? 0, stageCounts }
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

export async function updateDealNotes(id: string, notes: string) {
  const { error } = await getAdmin()
    .from('deals')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', id)
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
