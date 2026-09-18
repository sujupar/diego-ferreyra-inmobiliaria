import { createClient } from '@supabase/supabase-js'
import type { VisitDataSnapshot } from '@/types/visit-data.types'
import { ETAPAS_CON_VISITA_PENDIENTE } from '@/lib/pipeline/visita-datos'

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
  if (!data) throw new Error(`Deal ${dealId} not found or not updated`)
  return data as VisitDataSnapshot
}

export async function getVisitData(dealId: string): Promise<VisitDataSnapshot | null> {
  const { data, error } = await getAdmin().from('deals').select('visit_data').eq('id', dealId).single()
  if (error) throw error
  return (data?.visit_data as VisitDataSnapshot | null) || null
}

/**
 * Pasa el proceso a "Visita Realizada" SOLO si la visita estaba pendiente.
 * Devuelve si lo movió.
 *
 * Antes escribía `stage:'visited'` sin mirar la etapa: desde que el formulario
 * se puede reabrir después de la visita (2026-09-17), una pestaña vieja con
 * "Finalizar Visita" hacía RETROCEDER un proceso Captado. La condición va en la
 * MISMA sentencia (`in('stage', …)`), no en una lectura previa: así no hay
 * carrera entre leer la etapa y escribirla.
 */
export async function markVisitCompleted(dealId: string): Promise<boolean> {
  const { data, error } = await getAdmin()
    .from('deals')
    .update({
      stage: 'visited',
      visit_completed_at: new Date().toISOString(),
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .in('stage', [...ETAPAS_CON_VISITA_PENDIENTE])
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
