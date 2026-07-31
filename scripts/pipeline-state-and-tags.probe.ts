/**
 * Probe contra la base REAL (no hay servidor Next local levantado: Turbopack
 * revienta por el acento del path). Ejercita las funciones REALES de
 * `lib/leads/pipeline-state.ts` (`advancePipelineState`,
 * `setPipelineStateManually`, `resolveLeadIdForVisit`) y confirma el catálogo
 * `lead_tags` sembrado por la migración `20260801000001`.
 *
 * Crea 1 lead de prueba propio (prefijo "[TEST-PIPELINE]") + 1 fila en
 * `lead_access_tokens` para poder probar `resolveLeadIdForVisit`, los
 * ejercita, y al FINAL deja el lead soft-deleted (deleted_at = now()) —
 * nunca un DELETE real. No toca ningún lead real existente.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/pipeline-state-and-tags.probe.ts
 * (ejecutado desde la raíz del repo)
 */
import { createClient } from '@supabase/supabase-js'
import { advancePipelineState, setPipelineStateManually, resolveLeadIdForVisit } from '../lib/leads/pipeline-state'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let fallos = 0
function check(nombre: string, ok: boolean, detalle = '') {
  console.log(`${ok ? '✅' : '❌'} ${nombre}${ok ? '' : ` — ${detalle}`}`)
  if (!ok) fallos++
}

async function main() {
  // 0. Catálogo de etiquetas: confirmar que la semilla de la migración está.
  const { data: tagCatalog, error: tagErr } = await supabase
    .from('lead_tags')
    .select('slug, label, color, sort_order, is_active')
    .order('sort_order')
  check('lead_tags tiene 12 etiquetas sembradas', !tagErr && (tagCatalog ?? []).length === 12, `encontradas ${(tagCatalog ?? []).length}, err=${tagErr?.message}`)

  // 1. Propiedad existente cualquiera para el FK (no importa cuál, no se modifica).
  const { data: anyProp, error: propErr } = await supabase
    .from('properties')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (propErr || !anyProp) {
    console.error('No hay ninguna propiedad en la base para usar de FK — probe abortado.', propErr)
    process.exit(1)
  }
  const propertyId = (anyProp as { id: string }).id

  // 1b. Un profile existente cualquiera, para `changed_by` (FK real a profiles(id) — no se modifica).
  const { data: anyProfile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (profileErr || !anyProfile) {
    console.error('No hay ningún profile en la base para usar de changed_by — probe abortado.', profileErr)
    process.exit(1)
  }
  const profileId = (anyProfile as { id: string }).id

  // 2. Lead de prueba propio, arranca en 'nuevo' (default de la migración).
  const { data: created, error: insErr } = await supabase
    .from('property_leads')
    .insert({ property_id: propertyId, name: '[TEST-PIPELINE] Lead Probe', email: 'test-pipeline-probe@example.com', source: 'landing', status: 'new' })
    .select('id, pipeline_state')
    .single()
  if (insErr || !created) {
    console.error('No se pudo crear el lead de prueba', insErr)
    process.exit(1)
  }
  const leadId = (created as { id: string; pipeline_state: string }).id
  console.log(`Lead de prueba creado: ${leadId} (pipeline_state inicial: ${(created as { pipeline_state: string }).pipeline_state})`)

  try {
    check("el lead arranca en 'nuevo' (default de la columna)", (created as { pipeline_state: string }).pipeline_state === 'nuevo')

    // 3. advancePipelineState: nuevo → contactado (evento real: primer mensaje saliente).
    const r1 = await advancePipelineState(leadId, 'first_outbound_message')
    check('avance nuevo→contactado: changed=true', r1.changed === true, JSON.stringify(r1))
    check('avance nuevo→contactado: from=nuevo, to=contactado', r1.from === 'nuevo' && r1.to === 'contactado', JSON.stringify(r1))

    const { data: afterAdvance1 } = await supabase.from('property_leads').select('pipeline_state').eq('id', leadId).maybeSingle()
    check("la columna en la base quedó en 'contactado'", (afterAdvance1 as { pipeline_state: string } | null)?.pipeline_state === 'contactado')

    const { data: hist1 } = await supabase.from('lead_state_history').select('from_state, to_state, reason, changed_by').eq('lead_id', leadId).order('changed_at')
    check('quedó 1 fila en lead_state_history con from/to correctos y changed_by NULL (automático)', (hist1 ?? []).length === 1 && hist1![0].from_state === 'nuevo' && hist1![0].to_state === 'contactado' && hist1![0].changed_by === null, JSON.stringify(hist1))

    // 4. Idempotencia: repetir el mismo evento no debe volver a cambiar nada.
    const r2 = await advancePipelineState(leadId, 'first_outbound_message')
    check('repetir el mismo evento es no-op (changed=false)', r2.changed === false, JSON.stringify(r2))
    const { data: hist2 } = await supabase.from('lead_state_history').select('id').eq('lead_id', leadId)
    check('no se agregó una segunda fila de historial por el evento repetido', (hist2 ?? []).length === 1, `hay ${(hist2 ?? []).length}`)

    // 5. Avance directo a 'visito' (salto de 2 escalones de una).
    const r3 = await advancePipelineState(leadId, 'visit_completed')
    check('avance contactado→visito', r3.changed === true && r3.to === 'visito', JSON.stringify(r3))

    // 6. Nunca retrocede: un mensaje nuevo NO debe devolver a 'contactado'.
    const r4 = await advancePipelineState(leadId, 'first_outbound_message')
    check('un evento de rango inferior sobre un lead ya avanzado es no-op', r4.changed === false, JSON.stringify(r4))
    const { data: afterNoRetreat } = await supabase.from('property_leads').select('pipeline_state').eq('id', leadId).maybeSingle()
    check("el estado sigue en 'visito', no retrocedió", (afterNoRetreat as { pipeline_state: string } | null)?.pipeline_state === 'visito')

    // 7. resolveLeadIdForVisit: crear una property_visits + lead_access_tokens de prueba y verificar el link.
    const { data: visit, error: visitErr } = await supabase
      .from('property_visits')
      .insert({ property_id: propertyId, client_name: '[TEST-PIPELINE] Lead Probe', scheduled_at: new Date(Date.now() + 86400000).toISOString(), status: 'pending_confirmation' })
      .select('id')
      .single()
    if (visitErr || !visit) {
      console.error('No se pudo crear la visita de prueba', visitErr)
      throw visitErr
    }
    const visitId = (visit as { id: string }).id
    const { error: tokenErr } = await supabase
      .from('lead_access_tokens')
      .insert({ token: `test-pipeline-${leadId.slice(0, 8)}`, property_id: propertyId, lead_id: leadId, name: '[TEST-PIPELINE] Lead Probe', visit_id: visitId })
    check('token de prueba creado sin error', !tokenErr, tokenErr?.message)

    const resolved = await resolveLeadIdForVisit(visitId)
    check('resolveLeadIdForVisit encuentra el lead a través del token', resolved === leadId, `resolved=${resolved}`)

    const noSuchVisit = await resolveLeadIdForVisit('00000000-0000-0000-0000-000000000000')
    check('resolveLeadIdForVisit sobre una visita sin token asociado devuelve null (no lanza)', noSuchVisit === null)

    // Limpieza de la visita/token de prueba (no son leads, no hace falta soft-delete).
    await supabase.from('property_visits').delete().eq('id', visitId)
    await supabase.from('lead_access_tokens').delete().eq('token', `test-pipeline-${leadId.slice(0, 8)}`)

    // 8. setPipelineStateManually: retroceso manual con motivo obligatorio.
    const r5 = await setPipelineStateManually(leadId, 'perdido', profileId, 'Cliente dejó de responder tras 3 intentos')
    check('setPipelineStateManually retrocede visito→perdido (solo lo permite el manual)', r5.changed === true && r5.from === 'visito' && r5.to === 'perdido', JSON.stringify(r5))

    const { data: hist3 } = await supabase.from('lead_state_history').select('from_state, to_state, reason, changed_by').eq('lead_id', leadId).order('changed_at')
    const manualRow = (hist3 ?? []).find(h => h.to_state === 'perdido')
    check('el cambio manual quedó en el historial con reason y changed_by (no null)', !!manualRow && manualRow.reason === 'Cliente dejó de responder tras 3 intentos' && manualRow.changed_by === profileId, JSON.stringify(manualRow))

    // 9. setPipelineStateManually exige motivo no vacío.
    let threw = false
    try {
      await setPipelineStateManually(leadId, 'nuevo', profileId, '   ')
    } catch {
      threw = true
    }
    check('setPipelineStateManually lanza si el motivo viene vacío/blanco', threw)

    // 10. Tras el retroceso manual a 'perdido', un evento automático NO debe reabrirlo.
    const r6 = await advancePipelineState(leadId, 'first_outbound_message')
    check("un evento automático no reabre un lead marcado 'perdido' a mano", r6.changed === false, JSON.stringify(r6))
  } finally {
    // 11. Limpieza: dejar el lead soft-deleted (nunca un DELETE real).
    const { error: cleanupErr } = await supabase
      .from('property_leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', leadId)
    if (cleanupErr) {
      console.warn('No se pudo dejar el lead de prueba soft-deleted al final:', cleanupErr.message)
    } else {
      console.log('Limpieza: el lead de prueba quedó soft-deleted (deleted_at != null).')
    }
  }

  console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} verificación(es) fallaron`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
