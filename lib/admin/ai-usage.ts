/**
 * Panel de costo del agente de IA (task 5, `.superpowers/sdd/2026-08-03-agente-ia/`).
 *
 * Funciones PURAS de agregación — nada de red/Supabase acá (eso vive en
 * `app/api/admin/ai-usage/route.ts`), para poder testearlas sin mocks.
 *
 * A PROPÓSITO no importa nada de `lib/ai/` (otra tarea la está construyendo en
 * paralelo, ver CLAUDE.md de esta sesión): define su PROPIO subconjunto de
 * columnas de `conversation_ai_state`, así este módulo nunca se rompe si
 * cambia una función interna de `lib/ai/` — solo le importan las columnas,
 * que ya están fijadas por la migración `20260803000001_conversation_ai_state.sql`
 * (YA APLICADA).
 *
 * ## Limitación conocida (documentada a propósito, no resuelta acá)
 *
 * `conversation_ai_state` guarda contadores ACUMULADOS por conversación
 * (`analyses_count`, `tokens_used_total`), no un log de CADA análisis. No hay
 * una tabla de eventos día por día. Por eso el desglose "por día" de este
 * módulo es una APROXIMACIÓN: agrupa cada conversación por la fecha de su
 * ÚLTIMO análisis (`last_analyzed_at`) y le asigna TODO su acumulado a ese
 * día. Si una conversación fue analizada en más de un día, el acumulado
 * completo cae en el día del último análisis — no se reparte entre los días
 * reales. Es honesto y usable para "¿está gastando lo esperable?", pero NO es
 * un ledger exacto. Un ledger exacto necesitaría una tabla de eventos nueva
 * (migración), fuera del alcance de esta tarea (ver constraint "no escribas
 * migraciones").
 */

export type ConversationIntent = 'agendar' | 'consulta' | 'frio' | 'desconocido'

/** Subconjunto de `conversation_ai_state` que necesita este panel — columnas, no funciones de otra tarea. */
export interface AiUsageStateRow {
  phone_e164: string
  intent: ConversationIntent
  analyses_count: number
  tokens_used_total: number
  agent_messages_sent: number
  agent_handed_off: boolean
  last_analyzed_at: string | null
}

/**
 * Precio estimado por millón de tokens, en USD. `lib/ai/chat-client.ts` usa
 * DeepSeek (`deepseek-chat`) por default — precio blended (input+output)
 * aproximado a 2026-08. Es una ESTIMACIÓN a propósito (por eso el panel
 * siempre aclara "estimado" al lado): el precio real depende de la mezcla
 * input/output de cada llamada, que no se guarda por separado. Ajustar acá
 * si cambia el proveedor/modelo default (`AI_PROVIDER`/`AI_MODEL`).
 */
export const AI_TOKEN_PRICE_USD_PER_MILLION = 0.5

export function estimateCostUsd(tokens: number, pricePerMillion: number = AI_TOKEN_PRICE_USD_PER_MILLION): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0
  return (tokens / 1_000_000) * pricePerMillion
}

export interface AiUsageTotals {
  /** Conversaciones que la IA tocó AL MENOS una vez (analyses_count > 0). */
  conversationsAnalyzed: number
  analysesCount: number
  tokensUsedTotal: number
  estimatedCostUsd: number
  agentMessagesSent: number
  /** Conversaciones donde el agente llegó al tope de mensajes y le pasó la posta a un humano. */
  agentHandedOff: number
}

export function summarizeTotals(rows: AiUsageStateRow[]): AiUsageTotals {
  let conversationsAnalyzed = 0
  let analysesCount = 0
  let tokensUsedTotal = 0
  let agentMessagesSent = 0
  let agentHandedOff = 0

  for (const r of rows) {
    if (r.analyses_count > 0) conversationsAnalyzed++
    analysesCount += r.analyses_count
    tokensUsedTotal += r.tokens_used_total
    agentMessagesSent += r.agent_messages_sent
    if (r.agent_handed_off) agentHandedOff++
  }

  return {
    conversationsAnalyzed,
    analysesCount,
    tokensUsedTotal,
    estimatedCostUsd: estimateCostUsd(tokensUsedTotal),
    agentMessagesSent,
    agentHandedOff,
  }
}

export interface AiUsageDayBucket {
  /** YYYY-MM-DD, hora de Argentina. */
  date: string
  conversationsCount: number
  analysesCount: number
  tokensUsedTotal: number
  estimatedCostUsd: number
}

/** YYYY-MM-DD en horario de Argentina — mismo criterio que el resto del sistema (ver `hoyEnArgentina` en `/api/v/[token]/schedule`). */
function dayKeyArgentina(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/**
 * Agrupa por día del ÚLTIMO análisis de cada conversación (ver limitación
 * documentada arriba del archivo). Ordenado por fecha descendente (más
 * reciente primero) — lo que espera una tabla "por día" en pantalla.
 * Conversaciones sin `last_analyzed_at` (nunca analizadas) no aportan ningún
 * bucket — no hay día que asignarles.
 */
export function groupAnalysesByDay(rows: AiUsageStateRow[]): AiUsageDayBucket[] {
  const buckets = new Map<string, AiUsageDayBucket>()
  for (const r of rows) {
    if (!r.last_analyzed_at || r.analyses_count <= 0) continue
    const date = dayKeyArgentina(r.last_analyzed_at)
    const b = buckets.get(date) ?? { date, conversationsCount: 0, analysesCount: 0, tokensUsedTotal: 0, estimatedCostUsd: 0 }
    b.conversationsCount += 1
    b.analysesCount += r.analyses_count
    b.tokensUsedTotal += r.tokens_used_total
    b.estimatedCostUsd = estimateCostUsd(b.tokensUsedTotal)
    buckets.set(date, b)
  }
  return Array.from(buckets.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// ---------------------------------------------------------------------------
// Visitas agendadas por el agente (segundo punto del brief de task 5).
// ---------------------------------------------------------------------------

/**
 * `property_visits` no tiene (todavía) una columna que marque "esto lo creó
 * el agente de IA" — la migración de `conversation_ai_state` no la incluye, y
 * esta tarea tiene prohibido escribir migraciones nuevas. Task 3 (el agente
 * que agenda, en paralelo) reusa la MISMA ruta `/api/v/[token]/schedule` que
 * ya usa la agenda de autoservicio del cliente (`/v/[token]`) — ver su brief:
 * "Reusa esa ruta, no la dupliques" — así que no hay un marcador exclusivo de
 * "creado por IA" en la fila de la visita.
 *
 * Proxy usado acá, documentado y fácil de corregir el día que exista un
 * marcador real: una visita cuenta como "del agente" si su `client_phone`
 * coincide con el de una conversación donde `agent_messages_sent > 0` (el
 * agente efectivamente escribió en esa conversación — no solo "detectó
 * intención"). Comparación por los últimos 10 dígitos del teléfono (evita
 * falsos negativos por el 9 que Meta agrega a los móviles argentinos o por
 * formato +54/054/sin signos).
 */
export interface AgentTouchedConversation {
  phoneE164: string
  agentMessagesSent: number
}

export interface VisitLite {
  clientPhone: string | null
  status: string
}

export interface AgentVisitsSummary {
  /** Visitas (cualquier estado) asociadas a una conversación donde el agente escribió. */
  proposed: number
  /** De esas, cuántas terminaron confirmadas por el equipo o ya sucedieron. */
  confirmed: number
}

const CONFIRMED_STATUSES = new Set(['scheduled', 'completed'])

/** Últimos 10 dígitos — suficiente para no confundir números distintos y tolerante a +54/9/formato. */
function phoneMatchKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  return digits.slice(-10)
}

export function summarizeAgentVisits(conversations: AgentTouchedConversation[], visits: VisitLite[]): AgentVisitsSummary {
  const touchedKeys = new Set(
    conversations.filter(c => c.agentMessagesSent > 0).map(c => phoneMatchKey(c.phoneE164)).filter((k): k is string => k !== null),
  )

  let proposed = 0
  let confirmed = 0
  for (const v of visits) {
    const key = phoneMatchKey(v.clientPhone)
    if (!key || !touchedKeys.has(key)) continue
    proposed++
    if (CONFIRMED_STATUSES.has(v.status)) confirmed++
  }
  return { proposed, confirmed }
}
