import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type DealStage =
  | 'clase_gratuita'
  | 'request'
  | 'scheduled'
  | 'not_visited'
  | 'visited'
  | 'appraisal_sent'
  | 'followup'
  | 'captured'
  | 'lost'
  | 'comprador'

export const DEAL_STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: 'clase_gratuita', label: 'Clase Gratuita', color: 'bg-cyan-500' },
  { key: 'request', label: 'Solicitud', color: 'bg-sky-500' },
  { key: 'scheduled', label: 'Coordinada', color: 'bg-blue-500' },
  { key: 'not_visited', label: 'No Realizada', color: 'bg-rose-400' },
  { key: 'visited', label: 'Visita Realizada', color: 'bg-amber-500' },
  { key: 'appraisal_sent', label: 'Tasación Entregada', color: 'bg-purple-500' },
  { key: 'followup', label: 'En Seguimiento', color: 'bg-orange-500' },
  { key: 'captured', label: 'Captada', color: 'bg-green-500' },
  { key: 'lost', label: 'Descartado', color: 'bg-red-500' },
  { key: 'comprador', label: 'Comprador', color: 'bg-teal-500' },
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
  property_type?: 'departamento' | 'casa' | 'ph' | 'otro'
  property_type_other?: string | null
  neighborhood?: string
  rooms?: number
  covered_area?: number | null
  /**
   * Stage inicial. Default 'scheduled' para preservar comportamiento de los
   * forms internos. Webhooks GHL pasan 'request' o 'clase_gratuita'.
   */
  stage?: DealStage
}

export async function createDeal(input: DealInput) {
  const { stage = 'scheduled', ...rest } = input
  const { data, error } = await getAdmin()
    .from('deals')
    .insert({ ...rest, stage })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

/**
 * Apply CRM-stage semantics to a query.
 *
 * The CRM exposes 10 stages, but the DB has 10 raw stages where `scheduled`
 * splits into TWO CRM stages depending on whether `scheduled_date` is set:
 *  - scheduled + scheduled_date NULL  → "solicitud"
 *  - scheduled + scheduled_date NOT NULL → "coordinada"
 *
 * "solicitud" also includes raw stage='request' (the GHL webhook variant).
 */
function applyCRMStageFilter<T>(q: T, crmStage: string): T {
  const query = q as any
  switch (crmStage) {
    case 'clase_gratuita': return query.eq('stage', 'clase_gratuita')
    case 'solicitud':
      // (stage='request') OR (stage='scheduled' AND scheduled_date IS NULL)
      return query.or('stage.eq.request,and(stage.eq.scheduled,scheduled_date.is.null)')
    case 'coordinada':
      return query.eq('stage', 'scheduled').not('scheduled_date', 'is', null)
    case 'no_realizada': return query.eq('stage', 'not_visited')
    case 'realizada': return query.eq('stage', 'visited')
    case 'entregada': return query.eq('stage', 'appraisal_sent')
    case 'seguimiento': return query.eq('stage', 'followup')
    case 'captada': return query.eq('stage', 'captured')
    case 'descartado': return query.eq('stage', 'lost')
    case 'comprador': return query.eq('stage', 'comprador')
    default: return query
  }
}

export async function getDeals(filters?: {
  stage?: string; crm_stage?: string; origin?: string; assigned_to?: string;
  from?: string; to?: string; limit?: number; offset?: number;
}) {
  const limit = filters?.limit ?? 50
  const offset = filters?.offset ?? 0

  function applyFilters<T>(q: T): T {
    let query = q as any
    // crm_stage takes precedence over raw stage when both are present
    if (filters?.crm_stage) query = applyCRMStageFilter(query, filters.crm_stage)
    else if (filters?.stage) query = query.eq('stage', filters.stage)
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

  // stageCounts — counts per RAW stage, ignoring stage/crm_stage filter so the
  // pipeline tarjetas siempre muestran totales completos del usuario. Origin,
  // assigned_to y rango de fecha sí se respetan.
  // Para distinguir solicitud vs coordinada (ambas viven en stage='scheduled')
  // contamos por separado las que tienen scheduled_date NULL.
  const countQuery = getAdmin().from('deals').select('stage, scheduled_date')
  let cq = countQuery
  if (filters?.origin) cq = cq.eq('origin', filters.origin)
  if (filters?.assigned_to) cq = cq.eq('assigned_to', filters.assigned_to)
  if (filters?.from) cq = cq.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters?.to) cq = cq.lte('created_at', filters.to + 'T23:59:59Z')
  const { data: stageRows, error: stageErr } = await cq
  if (stageErr) throw stageErr

  const stageCounts: Record<string, number> = {}
  const crmStageCounts: Record<string, number> = {}
  for (const row of stageRows || []) {
    stageCounts[row.stage] = (stageCounts[row.stage] || 0) + 1
    // Derive CRM stage for the per-stage UI count (handles scheduled split).
    let crmKey: string
    switch (row.stage) {
      case 'clase_gratuita': crmKey = 'clase_gratuita'; break
      case 'request': crmKey = 'solicitud'; break
      case 'scheduled': crmKey = row.scheduled_date ? 'coordinada' : 'solicitud'; break
      case 'not_visited': crmKey = 'no_realizada'; break
      case 'visited': crmKey = 'realizada'; break
      case 'appraisal_sent': crmKey = 'entregada'; break
      case 'followup': crmKey = 'seguimiento'; break
      case 'captured': crmKey = 'captada'; break
      case 'lost': crmKey = 'descartado'; break
      case 'comprador': crmKey = 'comprador'; break
      default: crmKey = 'solicitud'
    }
    crmStageCounts[crmKey] = (crmStageCounts[crmKey] || 0) + 1
  }

  return { data: data || [], total: count ?? 0, stageCounts, crmStageCounts }
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

export async function updateDealSchedule(
  id: string,
  schedule: { scheduled_date: string | null; scheduled_time: string | null },
) {
  const { error } = await getAdmin()
    .from('deals')
    .update({
      scheduled_date: schedule.scheduled_date,
      scheduled_time: schedule.scheduled_time,
      updated_at: new Date().toISOString(),
    })
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
