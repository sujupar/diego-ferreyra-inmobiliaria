/**
 * El analista (task 2, 2026-08-03): UNA llamada al modelo por análisis, con
 * el resumen previo + los mensajes nuevos — nunca el hilo completo. Usa el
 * cliente agnóstico `lib/ai/chat-client` (DeepSeek barato por defecto, con
 * reintento a `gpt-4.1` de OpenAI si el JSON no valida el esquema), mismo
 * patrón que `lib/marketing/empathy-avatar-generator.ts`.
 *
 * Contrato duro: `analyzeConversation` NUNCA lanza. Ante cualquier fallo
 * (modelo caído, JSON inválido en los dos intentos, timeout) devuelve `null`
 * — el orquestador (`runConversationAnalysis`, más abajo) deja el estado
 * anterior intacto. Una conversación sin análisis se sigue ordenando por la
 * ventana de 24hs (`lib/integrations/whatsapp/window.ts`), que no necesita IA.
 */
import { chatCompletion } from '@/lib/ai/chat-client'
import {
  ANALYSIS_COOLDOWN_MS,
  SUMMARY_MAX_LENGTH,
  debeAnalizar,
  mensajesNuevosDesde,
  getConversationAiState,
  getRecentWhatsappMessages,
  saveConversationAiState,
  type ConversationAiStateRow,
  type ConversationIntent,
  type WhatsappMessageLite,
} from '@/lib/ai/conversation-memory'

// Re-exportado para quien orqueste el trigger (ej. el webhook de WhatsApp)
// sin tener que importar dos módulos para lo mismo.
export { ANALYSIS_COOLDOWN_MS, SUMMARY_MAX_LENGTH, debeAnalizar, mensajesNuevosDesde }
export type { ConversationAiStateRow, ConversationIntent, WhatsappMessageLite }

/** Techo duro de tokens de OUTPUT por llamada — la salida es un JSON chico, no necesita más. */
const ANALYSIS_MAX_OUTPUT_TOKENS = 500

const VALID_INTENTS: ConversationIntent[] = ['agendar', 'consulta', 'frio', 'desconocido']

const SYSTEM_PROMPT = `Sos el analista de un CRM inmobiliario en Argentina (Diego Ferreyra Inmobiliaria, CABA + GBA). Tu trabajo es leer el RESUMEN ACUMULADO de una conversación de WhatsApp con un cliente/lead MÁS los mensajes NUEVOS desde el último análisis, y devolver un veredicto corto para que un asesor humano priorice su bandeja de entrada.

IMPORTANTE: nunca ves el hilo completo, solo el resumen y los mensajes nuevos. El PRÓXIMO análisis va a ver TU resumen, no estos mensajes de nuevo — por eso el resumen que devuelvas tiene que incorporar TODO lo relevante (previo + nuevo), no solo lo último.

Reglas de cada campo:
- "summary": reescribilo COMPLETO desde cero (no lo apendees), en castellano rioplatense, sin relleno, máximo 400 caracteres.
- "intent": exactamente uno de "agendar" (quiere coordinar una visita), "consulta" (pregunta sobre la propiedad/proceso/precio), "frio" (sin intención clara, tibio o desinteresado), "desconocido" (todavía no hay info suficiente para saber).
- "priorityScore": número entero de 0 a 100 — qué tan urgente es que un asesor le responda YA (100 = urgentísimo).
- "priorityReason": UNA frase corta, en castellano rioplatense, que un asesor SIN conocimiento de IA entienda de un vistazo. Es lo que se le muestra en pantalla para justificar el orden — sin esto el orden automático no se usa.
- "suggestedNextStep": UNA frase con la acción concreta que el asesor debería tomar ahora.
- "wantsToSchedule": true SOLO si el cliente pidió explícitamente coordinar/agendar una visita en los mensajes nuevos o en el resumen.
- "proposedSlot": si el cliente propuso un día/horario concreto, textual tal cual lo dijo (ej. "mañana a la tarde", "el sábado a las 10"); si no propuso nada, null.

Devolvé SIEMPRE un JSON válido con EXACTAMENTE esas 7 claves, nada más.`

function buildUserPrompt(previousSummary: string, mensajesNuevos: WhatsappMessageLite[]): string {
  const lines = mensajesNuevos.map(
    (m) => `[${m.direction === 'in' ? 'Cliente' : 'Nosotros'}] ${m.body_preview?.trim() || '(sin texto — multimedia o vacío)'}`,
  )
  return [
    `Resumen previo:\n${previousSummary.trim() || '(sin resumen previo — es el primer análisis de esta conversación)'}`,
    `Mensajes nuevos desde el último análisis (${mensajesNuevos.length}):\n${lines.join('\n')}`,
  ].join('\n\n')
}

/** Lo que devuelve el modelo, ya validado/coercionado — nunca llega a acá algo con forma inválida. */
export interface AnalysisResult {
  summary: string
  intent: ConversationIntent
  priorityScore: number
  priorityReason: string
  suggestedNextStep: string
  wantsToSchedule: boolean
  proposedSlot: string | null
}

interface RawAnalysis {
  summary?: unknown
  intent?: unknown
  priorityScore?: unknown
  priorityReason?: unknown
  suggestedNextStep?: unknown
  wantsToSchedule?: unknown
  proposedSlot?: unknown
}

/**
 * Pura. Valida/coerciona la respuesta cruda del modelo al esquema esperado.
 * `null` si le faltan los campos mínimos para confiar en el resultado
 * (`summary` y `priorityReason` no negociables — son lo que se persiste y lo
 * que se le muestra al asesor). El resto se sanea con defaults seguros en vez
 * de invalidar todo el análisis por un campo secundario mal tipado.
 */
export function coerceAnalysisResult(raw: unknown): AnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as RawAnalysis

  if (typeof r.summary !== 'string' || !r.summary.trim()) return null
  if (typeof r.priorityReason !== 'string' || !r.priorityReason.trim()) return null

  const intent: ConversationIntent = VALID_INTENTS.includes(r.intent as ConversationIntent)
    ? (r.intent as ConversationIntent)
    : 'desconocido'

  const scoreRaw = typeof r.priorityScore === 'number' ? r.priorityScore : Number(r.priorityScore)
  const priorityScore = Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0

  const proposedSlot =
    typeof r.proposedSlot === 'string' && r.proposedSlot.trim() ? r.proposedSlot.trim() : null

  return {
    summary: r.summary.trim().slice(0, SUMMARY_MAX_LENGTH),
    intent,
    priorityScore,
    priorityReason: r.priorityReason.trim(),
    suggestedNextStep: typeof r.suggestedNextStep === 'string' ? r.suggestedNextStep.trim() : '',
    wantsToSchedule: r.wantsToSchedule === true,
    proposedSlot,
  }
}

/** `AnalysisResult` + observabilidad de costo de ESTA llamada puntual. */
export interface AnalysisPatch extends AnalysisResult {
  tokensUsed: number
  model: string
}

async function askModel(
  previousSummary: string,
  mensajesNuevos: WhatsappMessageLite[],
  override?: { model: string; provider: 'openai' },
): Promise<AnalysisPatch | null> {
  const res = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(previousSummary, mensajesNuevos) },
    ],
    temperature: 0.3,
    jsonMode: true,
    maxTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
    ...(override ? { model: override.model, provider: override.provider } : {}),
  })
  const parsed = JSON.parse(res.content) as unknown
  const coerced = coerceAnalysisResult(parsed)
  if (!coerced) return null
  return { ...coerced, tokensUsed: res.usage?.totalTokens ?? 0, model: res.model }
}

/**
 * UNA llamada al modelo (DeepSeek) por análisis; si el JSON no valida el
 * esquema, UN reintento a OpenAI `gpt-4.1`. NUNCA lanza: cualquier excepción
 * (red, parseo, API caída) en cualquiera de los dos intentos se traga y
 * devuelve `null` — "sin análisis nuevo", nunca un throw que tumbe al caller.
 *
 * No decide POR SÍ SOLA si hay que analizar — eso es `debeAnalizar` (import
 * de `conversation-memory`). Este módulo asume que ya se decidió que sí, y
 * que `mensajesNuevos` no está vacío (si está vacío, no hay nada que mandarle
 * al modelo y devuelve `null` sin gastar una llamada).
 */
export async function analyzeConversation(input: {
  previousSummary: string
  mensajesNuevos: WhatsappMessageLite[]
}): Promise<AnalysisPatch | null> {
  if (input.mensajesNuevos.length === 0) return null

  try {
    const result = await askModel(input.previousSummary, input.mensajesNuevos)
    if (result) return result
  } catch {
    /* cae al reintento con gpt-4.1 */
  }

  try {
    const result = await askModel(input.previousSummary, input.mensajesNuevos, {
      model: 'gpt-4.1',
      provider: 'openai',
    })
    if (result) return result
  } catch {
    /* nunca lanza: cae al null de abajo */
  }

  return null
}

export interface RunConversationAnalysisResult {
  /** Estado ACTUAL (post-corrida). Si no se analizó o falló, es el estado previo intacto. */
  state: ConversationAiStateRow | null
  /** `true` solo si se pagó y persistió un análisis nuevo en esta corrida. */
  analyzed: boolean
  /** Del análisis nuevo, si hubo. `false`/`null` si no se analizó — no implica que el cliente no quiera agendar, solo que no hay info nueva. */
  wantsToSchedule: boolean
  proposedSlot: string | null
}

/**
 * Orquestador end-to-end para UNA conversación: lee estado + mensajes, aplica
 * el gate de costo (`debeAnalizar`), y si corresponde llama al modelo y
 * persiste. Pensado para que lo dispare el trigger natural (mensaje entrante
 * de WhatsApp) — ver CLAUDE.md § "La plantilla recorrido_acceso_v3 trae un
 * botón de respuesta rápida". NUNCA lanza en ningún paso.
 */
export async function runConversationAnalysis(
  phoneE164: string,
  ahora: Date = new Date(),
): Promise<RunConversationAnalysisResult> {
  const [state, mensajes] = await Promise.all([
    getConversationAiState(phoneE164),
    getRecentWhatsappMessages(phoneE164),
  ])

  if (!debeAnalizar(state, mensajes, ahora)) {
    return { state, analyzed: false, wantsToSchedule: false, proposedSlot: null }
  }

  const nuevos = mensajesNuevosDesde(state, mensajes)
  const patch = await analyzeConversation({ previousSummary: state?.summary ?? '', mensajesNuevos: nuevos })
  if (!patch) {
    // Nunca lanza: se deja el estado anterior sin tocar. La conversación
    // igual se ordena por la ventana de 24hs, que no necesita IA.
    return { state, analyzed: false, wantsToSchedule: false, proposedSlot: null }
  }

  const ultimoNuevo = nuevos[nuevos.length - 1]
  const lastAnalyzedAt = ahora.toISOString()
  const tokensUsedTotal = (state?.tokens_used_total ?? 0) + patch.tokensUsed
  const analysesCount = (state?.analyses_count ?? 0) + 1

  await saveConversationAiState(phoneE164, {
    summary: patch.summary,
    lastAnalyzedMessageId: ultimoNuevo.id,
    lastAnalyzedAt,
    intent: patch.intent,
    priorityScore: patch.priorityScore,
    priorityReason: patch.priorityReason,
    suggestedNextStep: patch.suggestedNextStep,
    tokensUsedTotal,
    analysesCount,
  })

  const updatedState: ConversationAiStateRow = {
    phone_e164: phoneE164,
    summary: patch.summary.slice(0, SUMMARY_MAX_LENGTH),
    last_analyzed_message_id: ultimoNuevo.id,
    last_analyzed_at: lastAnalyzedAt,
    intent: patch.intent,
    priority_score: patch.priorityScore,
    priority_reason: patch.priorityReason,
    suggested_next_step: patch.suggestedNextStep,
    agent_messages_sent: state?.agent_messages_sent ?? 0,
    agent_handed_off: state?.agent_handed_off ?? false,
    tokens_used_total: tokensUsedTotal,
    analyses_count: analysesCount,
    created_at: state?.created_at ?? lastAnalyzedAt,
    updated_at: lastAnalyzedAt,
  }

  return {
    state: updatedState,
    analyzed: true,
    wantsToSchedule: patch.wantsToSchedule,
    proposedSlot: patch.proposedSlot,
  }
}
