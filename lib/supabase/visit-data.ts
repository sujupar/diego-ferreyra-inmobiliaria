import { createClient } from '@supabase/supabase-js'
import type { VisitDataSnapshot } from '@/types/visit-data.types'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function saveVisitData(dealId: string, snapshot: Partial<VisitDataSnapshot>) {
  const patch = { ...snapshot, updated_at: new Date().toISOString() }
  const { data, error } = await getAdmin().rpc('merge_deal_visit_data', {
    p_deal_id: dealId,
    p_patch: patch,
  })
  if (error) throw error
  return data as VisitDataSnapshot
}

export async function getVisitData(dealId: string): Promise<VisitDataSnapshot | null> {
  const { data, error } = await getAdmin().from('deals').select('visit_data').eq('id', dealId).single()
  if (error) throw error
  return (data?.visit_data as VisitDataSnapshot | null) || null
}

export async function markVisitCompleted(dealId: string) {
  const { error } = await getAdmin()
    .from('deals')
    .update({
      stage: 'visited',
      visit_completed_at: new Date().toISOString(),
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
  if (error) throw error
}
