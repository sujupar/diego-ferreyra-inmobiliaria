import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { serviceWindow } from '@/lib/integrations/whatsapp/window'
import { computePriority, type AiPriorityInput, type ConversationIntent } from '@/lib/integrations/whatsapp/priority'
// Sí, una ruta importando de `components/`: `awaiting.ts` es un módulo puro,
// sin React ni 'use client'. Es a propósito — el cliente hace el mismo cálculo
// como respaldo, y si cada lado tuviera su copia de la regla, la lista y el
// filtro "Sin responder" terminarían contradiciéndose (ya pasó con la nota
// interna del agente de IA). Una sola definición, imposible de desincronizar.
import { countsAsReply } from '@/components/inbox/awaiting'

/**
 * GET /api/whatsapp/conversations
 *
 * Lista las conversaciones de WhatsApp agrupadas por `phone_e164` (la clave
 * de conversación — ver COMMENT de la migración `20260730000001`). Alimenta
 * el chat del Inbox.
 *
 * Gate: solo operaciones (admin/dueno/coordinador) + asesor. El abogado tiene
 * prohibido el acceso a leads en toda la app (mismo criterio que
 * `/api/leads`), así que acá también queda afuera con 403.
 *
 * Asesor: solo ve conversaciones de SUS propiedades — resuelto vía
 * `whatsapp_messages.property_id` directo, o indirecto a través de
 * `whatsapp_messages.lead_id → property_leads.property_id` /
 * `property_leads.assigned_to`. Mismo patrón que `authorize()` en
 * `app/api/leads/[id]/route.ts`.
 *
 * `whatsapp_messages` NO está en `types/database.types.ts` (ver comentario en
 * `lib/integrations/whatsapp/log.ts`): cliente admin SIN el genérico
 * `<Database>` + cast manual.
 *
 * Respuesta: `{ data: Conversation[], webhookNotSubscribedWarning: boolean }` con
 * ```
 * Conversation = {
 *   phone_e164: string
 *   contact_name: string | null   // perfil de WhatsApp (Meta) o, si no hay, el nombre del lead
 *   lead_id: string | null
 *   lead_number: number | null    // "#número de comprador" (migración 20260731000001)
 *   property_id: string | null
 *   property: { id, address, title } | null
 *   advisor_id: string | null     // asesor asignado (propiedad, o el lead si la propiedad no tiene) — para el filtro "por asesor"
 *   advisor_name: string | null
 *   assigned_to_name: string | null  // = advisor_name, con el nombre de campo del contrato de Task 3
 *   pipeline_state: PipelineState    // Task 3 — 'nuevo' si la conversación no tiene lead resuelto todavía
 *   tags: Array<{ slug: string; label: string; color: string }>  // Task 3 — etiquetas del lead, [] si no hay lead
 *   awaiting_reply_since: string | null  // ISO del último entrante SIN respuesta posterior; null solo si después salió un mensaje DE VERDAD (ver `countsAsReply`)
 *   window: { open: boolean; msRemaining: number }  // Task 4 — ventana de 24hs RECALCULADA acá (serviceWindow sobre el último entrante, esté o no contestado)
 *   ai: { intent, priorityScore, priorityReason, suggestedNextStep, analyzedAt } | null  // Task 4 — lectura de `conversation_ai_state`; null = todavía no analizada
 *   agent_off: boolean            // `conversation_ai_state.agent_handed_off`: true = el agente NO contesta en esta conversación
 *   priority: { score, reason, windowUrgency, analyzed }  // Task 4 — computePriority(window, ai), SIEMPRE presente con un motivo en castellano
 *   last_message: string | null
 *   last_direction: 'in' | 'out'
 *   last_status: string
 *   last_at: string               // ISO
 *   unread_count: number          // entrantes con status='received'
 * }
 * ```
 * Ordenado por `last_at` desc — EXCEPTO con `?unanswered=1`, que ordena por
 * `awaiting_reply_since` ascendente (la que más hace que espera, primero: es
 * el filtro más importante, "la plata que se está enfriando").
 *
 * Filtros por query string (Task 3, se combinan con AND):
 *   - `?tag=<slug>`      — solo conversaciones cuyo lead tiene esa etiqueta.
 *   - `?state=<estado>`  — solo conversaciones cuyo lead está en ese `pipeline_state`.
 *   - `?advisor=<uuid>`  — solo conversaciones de ese asesor (`advisor_id`).
 *   - `?unanswered=1`    — solo conversaciones cuyo último mensaje es ENTRANTE
 *     (ver `awaiting_reply_since` arriba); fuerza el orden por espera.
 *   - `?q=<texto>`       — búsqueda libre (case-insensitive) contra nombre de
 *     contacto, teléfono y dirección/título de la propiedad.
 *
 * `window`/`ai`/`priority` (Task 4) NO tienen query param propio — igual que
 * el resto de los filtros de esta pantalla, "Ventana por cerrar" y "Orden IA"
 * se aplican client-side sobre la lista completa (`components/inbox/filters.ts`),
 * consistente con el resto de `ConversationFilterBar`. Acá solo se CALCULAN y
 * viajan en cada fila.
 *
 * `agent_off` va SUELTO y no adentro de `ai` A PROPÓSITO. Son dos preguntas
 * distintas que se responden con la misma fila de `conversation_ai_state`:
 * "¿la IA ya leyó esta conversación?" (`ai`, que es null hasta el primer
 * análisis) y "¿el agente tiene permitido contestar acá?" (`agent_off`, que se
 * puede apagar ANTES de que la IA hable — de hecho ese es el caso más útil:
 * `POST /api/whatsapp/conversations/[phone]/agent` crea la fila con el upsert).
 * Colgarlo de `ai` lo hacía invisible justo en ese caso, que es el que el botón
 * del Inbox necesita. Por el mismo motivo, `ai` solo se emite cuando la fila
 * tiene `last_analyzed_at`: una fila creada SOLO por el botón no debe hacerse
 * pasar por un análisis (diría "la IA no pudo determinar la intención",
 * pondría `priority.analyzed` en true y le partiría el score a la mitad a una
 * conversación que la IA nunca miró).
 *
 * `webhookNotSubscribedWarning`: true si en TODA la tabla no hay ni un solo
 * mensaje entrante NI una sola actualización de estado post-envío
 * (sent/delivered/read/failed) — la única explicación es que la URL del
 * webhook no está suscripta en el panel de Meta (el endpoint en sí ya
 * funciona, ver CLAUDE.md). El chat lo usa para mostrar un aviso accionable
 * en vez de dejar los mensajes en "Enviando…" para siempre sin explicar por qué.
 *
 * LÍMITE CONOCIDO (documentado, no resuelto acá): esto agrupa en memoria
 * sobre los últimos `SCAN_LIMIT` mensajes (no hay GROUP BY vía supabase-js sin
 * una RPC, y `whatsapp_messages` no tiene una vista/rollup todavía). Si el
 * volumen de mensajes crece mucho, una conversación vieja sin actividad
 * reciente podría no aparecer en la lista. Igual que `/metrics`, si esto se
 * vuelve un problema real conviene una RPC de agregación — no agregada acá
 * para no anticipar una migración que el usuario no pidió.
 *
 * Etiquetas SIN N+1 (punto explícito del brief de Task 3): se traen TODAS las
 * `lead_tag_assignments` de los leads presentes en UNA sola query
 * (`.in('lead_id', leadIds)`), nunca una query por conversación.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']
const SCAN_LIMIT = 5000

interface MessageRow {
  id: string
  direction: 'in' | 'out'
  phone_e164: string
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  body_preview: string | null
  status: string
  created_at: string
}

interface ConversationAcc {
  phone_e164: string
  contact_name: string | null
  lead_id: string | null
  property_id: string | null
  last_message: string | null
  last_direction: 'in' | 'out'
  last_status: string
  last_at: string
  unread_count: number
  /** Entrante más reciente sin respuesta efectiva; null si ya se le contestó. */
  awaiting_since: string | null
  /** Corta el barrido: ya sabemos si espera o no. */
  answered: boolean
  /**
   * Task 4 — último entrante de la conversación SIN IMPORTAR si ya se
   * contestó (`awaiting_since` se queda en null apenas se contesta; esto no).
   * Es lo que necesita `serviceWindow`: la ventana de 24hs depende del último
   * mensaje del CLIENTE, no de si el equipo ya respondió.
   */
  last_inbound_at: string | null
}

interface TagRow {
  slug: string
  label: string
  color: string
}

/** true si NUNCA llegó un entrante ni un estado post-envío — el webhook probablemente no está suscripto. Ver doc del endpoint. */
async function checkWebhookNotSubscribed(supabase: ReturnType<typeof admin>): Promise<boolean> {
  const [{ count: inboundCount }, { count: statusCount }] = await Promise.all([
    supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('direction', 'in'),
    supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).in('status', ['sent', 'delivered', 'read', 'failed']),
  ])
  return (inboundCount ?? 0) === 0 && (statusCount ?? 0) === 0
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const tagFilter = url.searchParams.get('tag')
    const stateFilter = url.searchParams.get('state')
    const advisorFilter = url.searchParams.get('advisor')
    const unansweredOnly = url.searchParams.get('unanswered') === '1'
    const qFilter = url.searchParams.get('q')?.trim().toLowerCase() || null

    const supabase = admin()

    const { data: rows, error } = await supabase
      .from('whatsapp_messages')
      .select('id, direction, phone_e164, contact_name, lead_id, property_id, body_preview, status, created_at')
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const allRows = (rows ?? []) as MessageRow[]

    // Agrupar por phone_e164. Como allRows viene ordenado desc, la PRIMERA vez
    // que vemos un teléfono es su mensaje más reciente.
    const groups = new Map<string, ConversationAcc>()
    for (const row of allRows) {
      let g = groups.get(row.phone_e164)
      if (!g) {
        g = {
          phone_e164: row.phone_e164,
          contact_name: row.contact_name,
          lead_id: row.lead_id,
          property_id: row.property_id,
          last_message: row.body_preview,
          last_direction: row.direction,
          last_status: row.status,
          last_at: row.created_at,
          unread_count: 0,
          awaiting_since: null,
          answered: false,
          last_inbound_at: null,
        }
        groups.set(row.phone_e164, g)
      } else {
        // Completar datos que el mensaje más reciente no tenía (ej. un entrante
        // viejo trae el contact_name pero el último mensaje es saliente).
        if (!g.contact_name && row.contact_name) g.contact_name = row.contact_name
        if (!g.lead_id && row.lead_id) g.lead_id = row.lead_id
        if (!g.property_id && row.property_id) g.property_id = row.property_id
      }
      if (row.direction === 'in' && row.status === 'received') g.unread_count += 1

      // Task 4: el entrante MÁS RECIENTE, esté o no contestado (independiente
      // del bloque `answered` de abajo). `allRows` viene desc, así que el
      // primero que encontramos ya es el más nuevo — se fija una sola vez.
      if (row.direction === 'in' && g.last_inbound_at === null) g.last_inbound_at = row.created_at

      // "Sin responder": el entrante más reciente que NO tenga después un
      // saliente que haya salido de verdad.
      //
      // `allRows` viene ordenado DESC, así que el primer hecho relevante que
      // encontramos define la respuesta y el resto se ignora (`answered`).
      // `countsAsReply` es LISTA BLANCA (accepted/sent/delivered/read): un
      // mensaje que REBOTÓ ('failed'/'skipped') o una fila que nunca se le
      // mandó al cliente —la nota interna 'agent_handoff' que deja el agente
      // de IA cuando se rinde— no son una respuesta. Con la lista negra que
      // había antes, esa nota marcaba la conversación como contestada y la
      // sacaba del filtro "Sin responder" y de la franja de demora, justo
      // cuando lo que hacía falta era que la agarre una persona.
      if (!g.answered) {
        if (row.direction === 'in') {
          g.awaiting_since = row.created_at
          g.answered = true
        } else if (countsAsReply(row.status)) {
          g.answered = true
        }
      }
    }

    // Hidratar leads referenciados (para property_id indirecto + nombre de fallback + ownership de asesor + estado del embudo).
    const leadIds = Array.from(new Set(Array.from(groups.values()).map(g => g.lead_id).filter((x): x is string => !!x)))
    let leadsMap = new Map<string, { id: string; property_id: string; name: string; assigned_to: string | null; lead_number: number | null; pipeline_state: string | null }>()
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from('property_leads')
        .select('id, property_id, name, assigned_to, lead_number, pipeline_state')
        .in('id', leadIds)
      leadsMap = new Map((leads ?? []).map(l => [l.id, l]))
    }

    // Etiquetas de TODOS los leads referenciados en UNA sola query (Task 3 —
    // "sin N+1" es el punto explícito del brief). `lead_tag_assignments` no
    // está en el Database type generado (migración 20260801000001) — mismo
    // cliente sin genérico que el resto del archivo.
    const tagsMap = new Map<string, TagRow[]>()
    if (leadIds.length > 0) {
      const { data: tagRows } = await supabase
        .from('lead_tag_assignments')
        .select('lead_id, lead_tags(slug, label, color)')
        // Solo las etiquetas VIGENTES: quitar una la MARCA (`removed_at`), no la borra.
        .is('removed_at', null)
        .in('lead_id', leadIds)
      for (const row of (tagRows ?? []) as unknown as Array<{ lead_id: string; lead_tags: TagRow | null }>) {
        if (!row.lead_tags) continue
        const arr = tagsMap.get(row.lead_id) ?? []
        arr.push(row.lead_tags)
        tagsMap.set(row.lead_id, arr)
      }
    }

    for (const g of groups.values()) {
      const lead = g.lead_id ? leadsMap.get(g.lead_id) : null
      if (!g.property_id && lead?.property_id) g.property_id = lead.property_id
      if (!g.contact_name && lead?.name) g.contact_name = lead.name
    }

    // Task 4 — lectura de la IA (`conversation_ai_state`, migración
    // `20260803000001_conversation_ai_state.sql`, YA APLICADA). UNA sola query
    // para TODOS los teléfonos presentes (mismo criterio "sin N+1" que las
    // etiquetas arriba). La tabla NO está en `types/database.types.ts` (el CLI
    // de Supabase no conecta acá) — mismo patrón de cliente sin genérico +
    // cast que el resto del archivo. Esta ruta solo LEE: la escribe
    // `lib/ai/conversation-memory.ts` (otra tarea, en paralelo).
    const allPhones = Array.from(groups.keys())
    const aiStateMap = new Map<string, AiPriorityInput & { suggestedNextStep: string | null; analyzedAt: string | null }>()
    // Freno del agente, SEPARADO del análisis: la fila existe (y `agent_off`
    // vale) aunque la IA nunca haya leído la conversación. Ver el comentario
    // largo del docstring — mezclarlos era el bug del botón que siempre decía
    // "Agente activo".
    const agentOffMap = new Map<string, boolean>()
    if (allPhones.length > 0) {
      const { data: aiRows } = await supabase
        .from('conversation_ai_state')
        .select('phone_e164, intent, priority_score, priority_reason, suggested_next_step, last_analyzed_at, agent_handed_off')
        .in('phone_e164', allPhones)
      for (const row of (aiRows ?? []) as Array<{
        phone_e164: string
        intent: string
        priority_score: number
        priority_reason: string | null
        suggested_next_step: string | null
        last_analyzed_at: string | null
        agent_handed_off: boolean | null
      }>) {
        // Si está derivada, el agente NO contesta en esta conversación. El
        // Inbox lo muestra en un botón para poder prenderlo/apagarlo a mano.
        agentOffMap.set(row.phone_e164, row.agent_handed_off === true)
        // Sin `last_analyzed_at` la IA todavía NO miró esta conversación: la
        // fila puede existir solo porque alguien apagó el agente a mano. Los
        // defaults NOT NULL de la tabla (intent 'desconocido', score 0) harían
        // pasar eso por un análisis real.
        if (!row.last_analyzed_at) continue
        aiStateMap.set(row.phone_e164, {
          intent: (row.intent ?? 'desconocido') as ConversationIntent,
          priorityScore: row.priority_score ?? 0,
          priorityReason: row.priority_reason,
          suggestedNextStep: row.suggested_next_step,
          analyzedAt: row.last_analyzed_at,
        })
      }
    }
    // Reloj único para TODA la respuesta — dos conversaciones con el mismo
    // último entrante deben dar exactamente la misma ventana en este request.
    const now = new Date()

    // Filtro de asesor: solo conversaciones de sus propiedades.
    let list = Array.from(groups.values())
    if (role === 'asesor') {
      const { data: props } = await supabase.from('properties').select('id').eq('assigned_to', user.id)
      const asesorPropertyIds = new Set((props ?? []).map(p => p.id))
      list = list.filter(g => {
        if (g.property_id && asesorPropertyIds.has(g.property_id)) return true
        const lead = g.lead_id ? leadsMap.get(g.lead_id) : null
        if (lead?.assigned_to === user.id) return true
        return false
      })
    }

    // Hidratar propiedades para el label + el asesor asignado (filtro "por asesor").
    const propertyIds = Array.from(new Set(list.map(g => g.property_id).filter((x): x is string => !!x)))
    let propsMap = new Map<string, { id: string; address: string; title: string | null; assigned_to: string | null }>()
    if (propertyIds.length > 0) {
      const { data: props } = await supabase
        .from('properties')
        .select('id, address, title, assigned_to')
        .in('id', propertyIds)
      propsMap = new Map((props ?? []).map(p => [p.id, p]))
    }

    // El asesor de una conversación es el de la PROPIEDAD si hay una asociada
    // (caso normal), o el del LEAD si no (ej. consulta general sin propiedad
    // todavía resuelta). Solo hidratamos profiles si hace falta el nombre.
    const advisorIdFor = (g: ConversationAcc): string | null => {
      const prop = g.property_id ? propsMap.get(g.property_id) : null
      if (prop?.assigned_to) return prop.assigned_to
      const lead = g.lead_id ? leadsMap.get(g.lead_id) : null
      return lead?.assigned_to ?? null
    }
    const advisorIds = Array.from(new Set(list.map(advisorIdFor).filter((x): x is string => !!x)))
    let advisorsMap = new Map<string, string>()
    if (advisorIds.length > 0) {
      const { data: advisors } = await supabase.from('profiles').select('id, full_name').in('id', advisorIds)
      advisorsMap = new Map((advisors ?? []).map(a => [a.id, a.full_name]))
    }

    const webhookNotSubscribedWarning = await checkWebhookNotSubscribed(supabase)

    let data = list.map(g => {
      const lead = g.lead_id ? leadsMap.get(g.lead_id) : null
      const advisorId = advisorIdFor(g)
      const advisorName = advisorId ? (advisorsMap.get(advisorId) ?? null) : null
      // Sin lead resuelto todavía no hay `pipeline_state` real que reportar —
      // se completa con 'nuevo' (el default de la columna) para que el campo
      // nunca sea null, tal como pide el contrato de Task 3.
      const pipelineState = (lead?.pipeline_state as string | undefined) ?? 'nuevo'
      // Calculado al agrupar: el entrante más reciente sin un saliente EXITOSO
      // después. Ver el comentario largo del acumulador arriba.
      const awaitingReplySince = g.awaiting_since

      // Task 4 — ventana de 24hs (calculada, SIEMPRE presente) + lectura de
      // la IA (puede ser null) + el score combinado con su motivo. Reusa
      // `serviceWindow` tal cual — cero recálculo propio de la ventana.
      const window = serviceWindow(g.last_inbound_at, now)
      const aiState = aiStateMap.get(g.phone_e164) ?? null
      const priority = computePriority(window, aiState)

      return {
        phone_e164: g.phone_e164,
        contact_name: g.contact_name,
        lead_id: g.lead_id,
        lead_number: lead?.lead_number ?? null,
        property_id: g.property_id,
        property: g.property_id && propsMap.has(g.property_id)
          ? (({ id, address, title }) => ({ id, address, title }))(propsMap.get(g.property_id)!)
          : null,
        advisor_id: advisorId,
        advisor_name: advisorName,
        assigned_to_name: advisorName,
        pipeline_state: pipelineState,
        tags: g.lead_id ? (tagsMap.get(g.lead_id) ?? []) : [],
        awaiting_reply_since: awaitingReplySince,
        last_message: g.last_message,
        last_direction: g.last_direction,
        last_status: g.last_status,
        last_at: g.last_at,
        unread_count: g.unread_count,
        window,
        ai: aiState
          ? {
              intent: aiState.intent,
              priorityScore: aiState.priorityScore,
              priorityReason: aiState.priorityReason,
              suggestedNextStep: aiState.suggestedNextStep,
              analyzedAt: aiState.analyzedAt,
            }
          : null,
        agent_off: agentOffMap.get(g.phone_e164) === true,
        priority,
      }
    })

    // Filtros (Task 3) — se combinan con AND, todos best-effort en memoria
    // (mismo criterio que el resto del archivo: no hay una vista/RPC de
    // agregación para whatsapp_messages todavía).
    if (tagFilter) data = data.filter(c => c.tags.some(t => t.slug === tagFilter))
    if (stateFilter) data = data.filter(c => c.pipeline_state === stateFilter)
    if (advisorFilter) data = data.filter(c => c.advisor_id === advisorFilter)
    if (unansweredOnly) data = data.filter(c => c.awaiting_reply_since !== null)
    if (qFilter) {
      data = data.filter(c => {
        const haystack = [
          c.contact_name,
          c.phone_e164,
          c.property?.address,
          c.property?.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(qFilter)
      })
    }

    // Orden: "sin responder" es EL filtro importante — ordena por cuánto hace
    // que esperan, la que más espera primero (timestamp más viejo primero).
    // Sin ese filtro, el orden de siempre: último mensaje más reciente primero.
    data = unansweredOnly
      ? data.sort((a, b) => new Date(a.awaiting_reply_since!).getTime() - new Date(b.awaiting_reply_since!).getTime())
      : data.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())

    return NextResponse.json({ data, webhookNotSubscribedWarning })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
