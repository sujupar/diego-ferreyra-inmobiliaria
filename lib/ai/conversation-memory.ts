/**
 * Memoria barata de la IA por conversación de WhatsApp (task 1, 2026-08-03).
 *
 * POR QUÉ EXISTE: sin esto, saber "cómo viene" una conversación obligaría a
 * mandarle el hilo COMPLETO a un modelo cada vez — con 300 conversaciones
 * activas y refresco de pantalla cada 15s eso son millones de tokens por día
 * para leer, casi siempre, exactamente lo mismo. Ver CLAUDE.md § costo de IA.
 *
 * Esta pieza es la tabla `conversation_ai_state` (migración
 * `20260803000001_conversation_ai_state.sql`, YA APLICADA) más DOS funciones
 * puras que son el corazón del ahorro:
 *
 *   - `mensajesNuevosDesde` recorta el hilo a SOLO lo no analizado.
 *   - `debeAnalizar` decide si vale la pena pagar un análisis (mensaje nuevo
 *     del cliente, sin rebote de <2min).
 *
 * `conversation_ai_state` NO está en `types/database.types.ts` (el CLI de
 * Supabase no conecta en este proyecto — ver CLAUDE.md § Supabase). Mismo
 * patrón que `lib/integrations/whatsapp/log.ts`: cliente SIN el genérico
 * `<Database>` + cast manual de las filas que entran/salen.
 */
import { createClient } from '@supabase/supabase-js'
// Importar de `components/` desde `lib/` es a propósito: `countsAsReply` es una
// función pura, sin React ni nada de cliente, y ya es la ÚNICA definición de
// "este saliente salió de verdad" que usan el endpoint `GET
// /api/whatsapp/conversations`, la lista del Inbox y las métricas del hilo.
// Duplicar la lista acá sería crear un cuarto criterio que se desalinea el día
// que aparezca un estado interno nuevo.
import { countsAsReply } from '@/components/inbox/awaiting'

export type ConversationIntent = 'agendar' | 'consulta' | 'frio' | 'desconocido'

/** Anti-rebote: un análisis no se repite antes de que pasen 2 minutos. */
export const ANALYSIS_COOLDOWN_MS = 2 * 60 * 1000

/** Tope duro del resumen acumulado — es lo que se paga en CADA análisis. */
export const SUMMARY_MAX_LENGTH = 400

/**
 * Fila de `conversation_ai_state` tal cual sale de Supabase (snake_case =
 * columnas de la tabla). `null` en los campos `last_analyzed_*` significa
 * "nunca se analizó esta conversación".
 */
export interface ConversationAiStateRow {
  phone_e164: string
  summary: string
  last_analyzed_message_id: string | null
  last_analyzed_at: string | null
  intent: ConversationIntent
  priority_score: number
  priority_reason: string | null
  suggested_next_step: string | null
  agent_messages_sent: number
  agent_handed_off: boolean
  tokens_used_total: number
  analyses_count: number
  created_at: string
  updated_at: string
}

/**
 * Recorte de `whatsapp_messages` a lo mínimo que necesita el análisis.
 * `direction`: 'in' = del cliente, 'out' = nuestro (asesor o plantilla).
 */
export interface WhatsappMessageLite {
  id: string
  direction: 'in' | 'out'
  body_preview: string | null
  status: string
  created_at: string
}

function byCreatedAtAsc(a: WhatsappMessageLite, b: WhatsappMessageLite): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

/**
 * `true` si este mensaje existió PARA EL CLIENTE: lo mandó él (`in`) o es un
 * saliente que salió de verdad hacia su WhatsApp (`countsAsReply`).
 *
 * POR QUÉ: en `whatsapp_messages` hay filas salientes que nunca salieron —las
 * notas internas del agente de IA (`agent_handoff`, `agent_visit_pending`,
 * `agent_visit_failed`, `agent_visit_unconfirmed`, constantes en
 * `lib/ai/scheduling-agent.ts`), los envíos rebotados (`failed`) y los que el
 * modo prueba nunca mandó (`skipped`)—. Para la IA esas filas son veneno en
 * dos lugares distintos: si entran al transcripto, el modelo cree que le
 * dijimos al cliente "le paso la conversación a una persona del equipo"; y si
 * cuentan como "nosotros ya hablamos", el gate de análisis se apaga justo
 * cuando el cliente sigue esperando y nadie le contestó.
 */
export function elClienteLoVio(m: Pick<WhatsappMessageLite, 'direction' | 'status'>): boolean {
  return m.direction === 'in' || countsAsReply(m.status)
}

/**
 * Devuelve SOLO los mensajes no analizados todavía, ordenados de más viejo a
 * más nuevo. Es la pieza que contiene el costo: sin esto, cada análisis
 * releería mensajes ya pagados.
 *
 * Estrategia: si `state.last_analyzed_message_id` está presente en `mensajes`,
 * se usa como ancla exacta (todo lo que viene DESPUÉS de esa posición). Si no
 * está (ej. el caller pasó una ventana acotada de mensajes recientes y el
 * ancla quedó afuera), se cae a comparar por `last_analyzed_at` — más laxo,
 * pero nunca deja un mensaje sin analizar.
 *
 * Sin estado previo (`state` null o sin ancla ninguna) devuelve TODO — es el
 * primer análisis de la conversación.
 */
export function mensajesNuevosDesde(
  state: ConversationAiStateRow | null,
  mensajes: WhatsappMessageLite[],
): WhatsappMessageLite[] {
  const ordenados = [...mensajes].sort(byCreatedAtAsc)
  if (!state) return ordenados

  if (state.last_analyzed_message_id) {
    const idx = ordenados.findIndex((m) => m.id === state.last_analyzed_message_id)
    if (idx !== -1) return ordenados.slice(idx + 1)
  }

  if (state.last_analyzed_at) {
    const cutoff = new Date(state.last_analyzed_at).getTime()
    if (!Number.isNaN(cutoff)) {
      return ordenados.filter((m) => new Date(m.created_at).getTime() > cutoff)
    }
  }

  return ordenados
}

/**
 * Pura. Decide si vale la pena pagar un análisis de IA para esta
 * conversación AHORA. `false` en cualquiera de estos 3 casos:
 *
 *   1. No hay mensajes nuevos desde el último análisis.
 *   2. El último mensaje de la conversación es NUESTRO Y SALIÓ DE VERDAD (no
 *      hay nada nuevo del cliente que leer — un mensaje saliente solo no
 *      dispara análisis).
 *   3. Ya se analizó hace menos de `ANALYSIS_COOLDOWN_MS` (anti-rebote: varios
 *      mensajes del cliente llegando seguidos no deben pagar un análisis cada
 *      uno).
 *
 * OJO con el 2: el gate mira `elClienteLoVio`, no `direction` a secas. Una nota
 * interna del agente al final del hilo NO es "nosotros ya contestamos" — el
 * cliente nunca la recibió y sigue esperando; ese es exactamente el momento en
 * que hay que analizar, no el momento de callarse. Por lo mismo, "nuevo" acá
 * son los mensajes nuevos que el cliente vio: un hilo cuyo único movimiento
 * desde el último análisis son notas internas no tiene nada que leerle al
 * modelo, y pagar esa llamada sería mandarle un transcripto vacío.
 *
 * Un bug acá se paga en la factura todos los días — está testeada a fondo.
 */
export function debeAnalizar(
  state: ConversationAiStateRow | null,
  mensajes: WhatsappMessageLite[],
  ahora: Date,
): boolean {
  const nuevos = mensajesNuevosDesde(state, mensajes).filter(elClienteLoVio)
  if (nuevos.length === 0) return false

  const ordenados = [...mensajes].sort(byCreatedAtAsc).filter(elClienteLoVio)
  const ultimo = ordenados[ordenados.length - 1]
  if (!ultimo || ultimo.direction === 'out') return false

  if (state?.last_analyzed_at) {
    const lastAnalyzed = new Date(state.last_analyzed_at).getTime()
    if (!Number.isNaN(lastAnalyzed) && ahora.getTime() - lastAnalyzed < ANALYSIS_COOLDOWN_MS) {
      return false
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// I/O — Supabase (service role). Todo lo de abajo puede fallar por red/RLS/
// tabla ausente; NUNCA se deja explotar el flujo que lo llama (mismo criterio
// que `lib/integrations/whatsapp/log.ts`: warn + degradar, no throw).
// ---------------------------------------------------------------------------

function admin() {
  // Sin genérico <Database>: conversation_ai_state no está en los types
  // generados (CLI de Supabase no conecta). Casteamos las filas abajo.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Resultado de leer `conversation_ai_state`. Existe porque `null` a secas
 * mezclaba DOS cosas que no son lo mismo: "esta conversación nunca se analizó"
 * (normal, el primer mensaje del cliente) y "no pude leer la tabla" (hipo de
 * red, RLS, PostgREST caído).
 *
 * Ese empate se pagaba caro: los contadores del agente (`agent_messages_sent`,
 * `agent_handed_off`) viven en esta fila, y un `null` por error se leía río
 * abajo como "0 mensajes mandados, no derivada" → una conversación YA en manos
 * de un humano podía recibir otro WhatsApp del agente. La regla del dueño es
 * la contraria: ante duda o error de lectura, no se manda nada.
 */
export interface ConversationAiStateRead {
  /** La fila, o `null` si la conversación nunca se analizó. Solo significa eso si `readFailed` es `false`. */
  state: ConversationAiStateRow | null
  /** `true` = NO se pudo leer. No confundir con "no hay fila": acá no sabemos nada de la conversación. */
  readFailed: boolean
}

/**
 * Lee el estado acumulado de una conversación. NUNCA lanza (mismo criterio que
 * el resto del módulo), pero SÍ distingue el fallo del vacío — ver
 * `ConversationAiStateRead`. Quien la llame tiene que frenar ante
 * `readFailed: true`, no seguir con defaults.
 */
export async function getConversationAiState(phoneE164: string): Promise<ConversationAiStateRead> {
  try {
    const { data, error } = await admin()
      .from('conversation_ai_state')
      .select('*')
      .eq('phone_e164', phoneE164)
      .maybeSingle()
    if (error) {
      console.warn('[conversation-memory] no se pudo leer el estado (freno de mano: no se analiza):', error.message)
      return { state: null, readFailed: true }
    }
    return { state: (data as ConversationAiStateRow | null) ?? null, readFailed: false }
  } catch (err) {
    console.warn('[conversation-memory] excepción leyendo el estado (freno de mano: no se analiza):', err)
    return { state: null, readFailed: true }
  }
}

/**
 * Mensajes de `whatsapp_messages` de una conversación, ascendente por fecha
 * (más viejo primero) — el orden que esperan `mensajesNuevosDesde`/`debeAnalizar`.
 */
export async function getRecentWhatsappMessages(
  phoneE164: string,
  opts?: { limit?: number },
): Promise<WhatsappMessageLite[]> {
  const limit = opts?.limit ?? 200
  try {
    const { data, error } = await admin()
      .from('whatsapp_messages')
      .select('id, direction, body_preview, status, created_at')
      .eq('phone_e164', phoneE164)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.warn('[conversation-memory] no se pudieron leer los mensajes (continuando sin memoria):', error.message)
      return []
    }
    const rows = (data as WhatsappMessageLite[] | null) ?? []
    return rows.slice().sort(byCreatedAtAsc)
  } catch (err) {
    console.warn('[conversation-memory] excepción leyendo mensajes (continuando sin memoria):', err)
    return []
  }
}

/** Insumos para persistir el resultado de un análisis. camelCase → se mapea a columnas abajo. */
export interface ConversationAiStatePatch {
  summary: string
  lastAnalyzedMessageId: string | null
  lastAnalyzedAt: string
  intent: ConversationIntent
  priorityScore: number
  priorityReason: string | null
  suggestedNextStep: string | null
  tokensUsedTotal: number
  analysesCount: number
}

/**
 * Upsert de `conversation_ai_state` (PK = `phone_e164`, cumple el requisito
 * de UNIQUE constraint para `onConflict` — ver CLAUDE.md § upsert onConflict).
 * NUNCA lanza: si falla, solo hace `console.warn` (mismo criterio que
 * `lib/integrations/whatsapp/log.ts`) — perder la persistencia del análisis
 * no puede tumbar el flujo que ya pagó la llamada al modelo.
 */
export async function saveConversationAiState(
  phoneE164: string,
  patch: ConversationAiStatePatch,
): Promise<void> {
  try {
    const { error } = await admin()
      .from('conversation_ai_state')
      .upsert(
        {
          phone_e164: phoneE164,
          summary: patch.summary.slice(0, SUMMARY_MAX_LENGTH),
          last_analyzed_message_id: patch.lastAnalyzedMessageId,
          last_analyzed_at: patch.lastAnalyzedAt,
          intent: patch.intent,
          priority_score: patch.priorityScore,
          priority_reason: patch.priorityReason,
          suggested_next_step: patch.suggestedNextStep,
          tokens_used_total: patch.tokensUsedTotal,
          analyses_count: patch.analysesCount,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'phone_e164' },
      )
    if (error) {
      console.warn('[conversation-memory] no se pudo guardar el análisis (continuando):', error.message)
    }
  } catch (err) {
    console.warn('[conversation-memory] excepción guardando el análisis (continuando):', err)
  }
}

/**
 * Patch PARCIAL de las columnas del agente que ESCRIBE (task 3,
 * `lib/ai/scheduling-agent.ts`) — distinto de `saveConversationAiState`
 * (que reescribe el análisis completo). Un `UPDATE`, no un upsert: asume que
 * la fila ya existe (la crea `saveConversationAiState` en el mismo ciclo de
 * request — ver el contrato documentado en `analyze-conversation.ts`).
 */
export interface AgentStatePatch {
  agentMessagesSent?: number
  agentHandedOff?: boolean
}

/**
 * Persiste cuántos mensajes mandó el agente y/o si le pasó la conversación a
 * un humano. NUNCA lanza (mismo criterio que `saveConversationAiState`): si
 * falla, solo `console.warn` — el mensaje ya se mandó (o se decidió no
 * mandar) y no puede depender de que esto funcione.
 */
export async function updateAgentState(phoneE164: string, patch: AgentStatePatch): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.agentMessagesSent !== undefined) update.agent_messages_sent = patch.agentMessagesSent
  if (patch.agentHandedOff !== undefined) update.agent_handed_off = patch.agentHandedOff
  try {
    const { error } = await admin()
      .from('conversation_ai_state')
      .update(update as never)
      .eq('phone_e164', phoneE164)
    if (error) {
      console.warn('[conversation-memory] no se pudo actualizar el estado del agente (continuando):', error.message)
    }
  } catch (err) {
    console.warn('[conversation-memory] excepción actualizando el estado del agente (continuando):', err)
  }
}
