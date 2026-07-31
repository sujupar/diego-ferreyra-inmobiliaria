/**
 * Estado del comprador en el embudo (`property_leads.pipeline_state`).
 *
 * Un solo estado por persona. Avanza SOLO con hechos que el sistema ya
 * registra en otra parte (primer mensaje saliente del equipo, visita
 * agendada, visita realizada) — nunca a mano vía este camino. Distinto de
 * las ETIQUETAS (`./tags.ts`), que son varias por persona y las pone el
 * equipo directamente.
 *
 * Regla dura: el estado NUNCA retrocede solo. Un mensaje nuevo a alguien que
 * ya visitó no lo puede devolver a "contactado" — si eso pasara, el embudo
 * dejaría de significar nada. Bajar el estado es SIEMPRE una acción manual de
 * una persona (`setPipelineStateManually`), con motivo obligatorio y
 * auditado en `lead_state_history` (mismo patrón que `deal_stage_history`,
 * ver `supabase/migrations/20260520000001_fix_deal_stage_history_trigger.sql`
 * — la lección de ahí es que un trigger BEFORE no puede insertar en una tabla
 * con FK al row que todavía no existe; acá se evita el problema entero
 * resolviendo esto en CÓDIGO, no en un trigger de Postgres, que además es
 * mucho más fácil de testear).
 *
 * `property_leads.pipeline_state`, `lead_tags`, `lead_tag_assignments` y
 * `lead_state_history` NO están en `types/database.types.ts` (el CLI de
 * Supabase no conecta en este proyecto — ver CLAUDE.md § Supabase). Mismo
 * patrón que `lib/integrations/whatsapp/log.ts`: cliente Supabase SIN el
 * genérico `<Database>` + cast manual de las filas. Cuando el CLI vuelva a
 * conectar y se regeneren los types, este archivo puede migrar a un cliente
 * tipado.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Mismo enum que el CHECK de `property_leads.pipeline_state` en la migración `20260801000001`. */
export const PIPELINE_STATES = [
  'nuevo',
  'contactado',
  'visita_agendada',
  'visito',
  'negociando',
  'cerrado',
  'perdido',
] as const

export type PipelineState = (typeof PIPELINE_STATES)[number]

export function isPipelineState(value: string): value is PipelineState {
  return (PIPELINE_STATES as readonly string[]).includes(value)
}

/** Rótulo prolijo para chip de UI. Texto libre a propósito — no es la clave de negocio. */
export const PIPELINE_STATE_LABELS: Record<PipelineState, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  visita_agendada: 'Visita agendada',
  visito: 'Visitó',
  negociando: 'Negociando',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
}

/**
 * Hechos del sistema que pueden mover el estado hacia adelante. Cada uno
 * corresponde 1:1 a algo que otra parte del código YA registra:
 *   - `first_outbound_message` → sale el primer mensaje del equipo
 *     (`whatsapp_messages` con `direction='out'` y `sent_by` no nulo).
 *   - `visit_scheduled` → se crea una `property_visits` para ese lead.
 *   - `visit_completed` → esa visita pasa a `status='completed'`.
 */
export type PipelineEvent = 'first_outbound_message' | 'visit_scheduled' | 'visit_completed'

/** A qué estado apunta cada evento automático. */
const EVENT_TARGET: Record<PipelineEvent, PipelineState> = {
  first_outbound_message: 'contactado',
  visit_scheduled: 'visita_agendada',
  visit_completed: 'visito',
}

/** Motivo que queda en `lead_state_history.reason` para cada evento automático. */
const EVENT_REASON: Record<PipelineEvent, string> = {
  first_outbound_message: 'Primer mensaje saliente del equipo',
  visit_scheduled: 'Visita agendada',
  visit_completed: 'Visita marcada como realizada',
}

/**
 * Orden de la ESCALERA AUTOMÁTICA (solo estos 4 — `negociando`/`cerrado`/
 * `perdido` son manuales a propósito: ningún hecho automático los infiere,
 * así que quedan FUERA de esta escalera). Un estado sin rank acá (los 3
 * manuales) es "más alto que cualquier cosa" a efectos de la comparación de
 * abajo: los eventos automáticos NUNCA lo tocan, ni para "avanzarlo" ni para
 * retrocederlo — solo una persona los mueve desde ahí.
 */
const AUTO_RANK: Partial<Record<PipelineState, number>> = {
  nuevo: 0,
  contactado: 1,
  visita_agendada: 2,
  visito: 3,
}

/**
 * Función PURA: dado el estado actual y un hecho, decide el próximo estado
 * (o `null` si no corresponde cambiar nada). Nunca retrocede: si el estado
 * actual ya tiene rank igual o mayor al que apunta el evento, no hace nada
 * (esto también cubre la idempotencia — llamar dos veces con el mismo evento
 * no duplica nada). Si el estado actual es uno de los 3 manuales
 * (`negociando`/`cerrado`/`perdido`), tampoco hace nada: esos solo se mueven
 * a mano.
 */
export function nextStateFor(current: PipelineState, event: PipelineEvent): PipelineState | null {
  const target = EVENT_TARGET[event]
  const currentRank = AUTO_RANK[current]
  if (currentRank === undefined) return null
  const targetRank = AUTO_RANK[target]!
  if (targetRank <= currentRank) return null
  return target
}

export interface PipelineStateChange {
  changed: boolean
  from: PipelineState | null
  to: PipelineState | null
}

const NO_CHANGE: PipelineStateChange = { changed: false, from: null, to: null }

/**
 * Avanza el estado de un lead a partir de un hecho del sistema. BEST-EFFORT
 * como `logOutbound`: nunca lanza — el hecho de negocio (el mensaje salió, la
 * visita se agendó/completó) YA pasó y no puede depender de que esto
 * funcione. Cualquier error queda en `console.warn` y devuelve
 * `{changed:false,...}`.
 *
 * No toca leads borrados lógicamente (`deleted_at` no nulo) ni leads
 * inexistentes.
 *
 * La actualización es CONDICIONAL (`WHERE pipeline_state = current`) para
 * que una carrera entre dos llamadas concurrentes no pise un cambio más
 * reciente — si otra llamada ya movió el estado, esta simplemente no hace
 * nada (no es un error).
 */
export async function advancePipelineState(
  leadId: string,
  event: PipelineEvent,
): Promise<PipelineStateChange> {
  try {
    const sb = admin()
    const { data: lead, error: readError } = await sb
      .from('property_leads')
      .select('pipeline_state, deleted_at')
      .eq('id', leadId)
      .maybeSingle()
    if (readError) {
      console.warn('[pipeline-state] no se pudo leer el lead (continuando):', readError.message)
      return NO_CHANGE
    }
    const row = lead as { pipeline_state: string; deleted_at: string | null } | null
    if (!row || row.deleted_at) return NO_CHANGE

    const current = isPipelineState(row.pipeline_state) ? row.pipeline_state : 'nuevo'
    const next = nextStateFor(current, event)
    if (!next) return NO_CHANGE

    const { data: updated, error: updateError } = await sb
      .from('property_leads')
      .update({ pipeline_state: next, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('pipeline_state', current)
      .select('id')
      .maybeSingle()
    if (updateError) {
      console.warn('[pipeline-state] no se pudo actualizar (continuando):', updateError.message)
      return NO_CHANGE
    }
    if (!updated) return NO_CHANGE // otra llamada concurrente ya lo movió — no es un error

    const { error: historyError } = await sb.from('lead_state_history').insert({
      lead_id: leadId,
      from_state: current,
      to_state: next,
      reason: EVENT_REASON[event],
      changed_by: null, // automático — nadie "cambió" esto a mano
    })
    if (historyError) {
      console.warn('[pipeline-state] no se pudo registrar el historial (el estado igual cambió):', historyError.message)
    }

    return { changed: true, from: current, to: next }
  } catch (err) {
    console.warn('[pipeline-state] excepción avanzando el estado (continuando):', err)
    return NO_CHANGE
  }
}

/**
 * Baja o cambia el estado A MANO. A diferencia de `advancePipelineState`,
 * esto SÍ puede retroceder (es la única vía permitida para hacerlo) y SÍ
 * lanza en caso de error — es una acción deliberada de una persona desde la
 * UI, no un efecto secundario de otra ruta, así que el caller necesita saber
 * si falló para avisarle.
 *
 * Exige `changedBy` (quién) y `reason` no vacío (por qué) — sin esto,
 * "¿por qué este lead volvió a contactado?" no tiene respuesta, igual que
 * `deal_stage_history`.
 */
export async function setPipelineStateManually(
  leadId: string,
  toState: PipelineState,
  changedBy: string,
  reason: string,
): Promise<PipelineStateChange> {
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new Error('El motivo es obligatorio para cambiar el estado a mano')
  if (!changedBy) throw new Error('Falta quién hace el cambio')
  if (!isPipelineState(toState)) throw new Error(`Estado inválido: ${toState}`)

  const sb = admin()
  const { data: lead, error: readError } = await sb
    .from('property_leads')
    .select('pipeline_state, deleted_at')
    .eq('id', leadId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  const row = lead as { pipeline_state: string; deleted_at: string | null } | null
  if (!row) throw new Error('Lead no encontrado')
  if (row.deleted_at) throw new Error('El lead está en la papelera')

  const current = isPipelineState(row.pipeline_state) ? row.pipeline_state : 'nuevo'
  if (current === toState) return NO_CHANGE

  const { error: updateError } = await sb
    .from('property_leads')
    .update({ pipeline_state: toState, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (updateError) throw new Error(updateError.message)

  const { error: historyError } = await sb.from('lead_state_history').insert({
    lead_id: leadId,
    from_state: current,
    to_state: toState,
    reason: trimmedReason,
    changed_by: changedBy,
  })
  if (historyError) {
    // El estado YA cambió — no deshacemos por un fallo de auditoría, pero se
    // avisa fuerte porque acá sí importa (es un cambio manual, no automático).
    console.error('[pipeline-state] el estado cambió pero el historial NO se pudo registrar:', historyError.message)
  }

  return { changed: true, from: current, to: toState }
}

/**
 * Resuelve el `lead_id` dueño de una `property_visits`, vía
 * `lead_access_tokens.visit_id` (el vínculo que arma
 * `app/api/v/[token]/schedule/route.ts` al crear/actualizar la visita desde
 * el recorrido público). Si la visita no nació de ese flujo (ej. cargada a
 * mano por el equipo) no hay token que la referencie y esto devuelve `null`
 * — no hay otro vínculo confiable (`property_visits` no tiene `lead_id`
 * propio, ver `types/visits.types.ts`). Nunca lanza.
 */
export async function resolveLeadIdForVisit(visitId: string): Promise<string | null> {
  try {
    const sb = admin()
    const { data } = await sb
      .from('lead_access_tokens')
      .select('lead_id')
      .eq('visit_id', visitId)
      .maybeSingle()
    return (data as { lead_id: string | null } | null)?.lead_id ?? null
  } catch {
    return null
  }
}
