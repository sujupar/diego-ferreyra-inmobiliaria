/**
 * El analista (task 2, 2026-08-03): UNA llamada al modelo por análisis, con
 * el resumen previo + los mensajes nuevos — nunca el hilo completo. Usa el
 * cliente agnóstico `lib/ai/chat-client` (DeepSeek barato por defecto), mismo
 * patrón que `lib/marketing/empathy-avatar-generator.ts`.
 *
 * UNA sola llamada al modelo, y con techo de tiempo. Esto corre DENTRO del POST
 * del webhook de WhatsApp, que además baja adjuntos, manda un WhatsApp y un
 * mail; Netlify corta a los ~26s (`maxDuration` es de Vercel, acá no hace
 * nada). Si el 200 no le llega a Meta, Meta reintenta en loop y puede terminar
 * DESHABILITANDO el webhook — se dejarían de recibir todos los mensajes. Por
 * eso no hay reintento a un segundo modelo acá adentro: ver CLAUDE.md § "nunca
 * encadenar varias llamadas de IA dentro de UN request".
 *
 * ARRANCA APAGADO, igual que el agente que escribe. El interruptor propio es
 * `ai_agent_settings.analysis_enabled` (migración `20260803000006`, default
 * `false`) y se chequea DENTRO de `analyzeConversation` — el chokepoint por
 * donde pasa la única llamada al modelo. Analizar no le habla a nadie, pero
 * cuesta plata y le cuelga hasta 12s al webhook que Meta está esperando: quién y
 * cuándo se prende lo decide el dueño, no un merge a main.
 *
 * Contrato duro: `analyzeConversation` NUNCA lanza. Ante cualquier fallo
 * (modelo caído, JSON inválido, timeout) devuelve `null` — el orquestador
 * (`runConversationAnalysis`, más abajo) deja el estado anterior intacto y el
 * PRÓXIMO mensaje del cliente vuelve a intentar. Una conversación sin análisis
 * se sigue ordenando por la ventana de 24hs
 * (`lib/integrations/whatsapp/window.ts`), que no necesita IA.
 */
import { createClient } from '@supabase/supabase-js'
import { chatCompletion } from '@/lib/ai/chat-client'
import {
  ANALYSIS_COOLDOWN_MS,
  SUMMARY_MAX_LENGTH,
  debeAnalizar,
  elClienteLoVio,
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

/**
 * Techo duro de TIEMPO de la llamada al modelo. 12s deja aire para lo que el
 * webhook hace después (mandar el WhatsApp, el mail, persistir) dentro de los
 * ~26s que aguanta una función de Netlify. Sin esto, un proveedor colgado se
 * lleva puesta la función entera y Meta nunca ve el 200.
 */
const ANALYSIS_TIMEOUT_MS = 12_000

import {
  DEFAULT_AGENT_PROMPT,
  buildBrainUserPrompt,
  coerceBrainDecision,
  type BrainContext,
} from '@/lib/ai/agent-brain'

const VALID_INTENTS: ConversationIntent[] = ['agendar', 'consulta', 'frio', 'desconocido']

/**
 * Contexto que el AGENTE necesita para pensar la respuesta y que este módulo no
 * puede averiguar solo (vive en `properties`, `ai_agent_settings` y
 * `property_visits`): lo arma `lib/ai/scheduling-agent.ts` y se lo pasa acá.
 *
 * Cuando viene, la llamada al modelo usa el prompt del AGENTE
 * (`DEFAULT_AGENT_PROMPT`): entiende la conversación Y redacta la respuesta.
 * Cuando no viene, se usa el prompt de ANALISTA de siempre — que solo clasifica
 * para ordenar la bandeja y NO contesta nada. Esa segunda variante es la que
 * corre mientras no haya propiedad asociada a la conversación: sin propiedad no
 * hay datos que contestar, y un agente que improvisa es peor que uno callado.
 */
export type BrainInput = Omit<BrainContext, 'previousSummary' | 'newMessages'>

// ---------------------------------------------------------------------------
// Interruptor del ANÁLISIS (`ai_agent_settings.analysis_enabled`, migración
// `20260803000006_ai_analysis_switch.sql`). Arranca APAGADO.
// ---------------------------------------------------------------------------

/**
 * Cliente admin propio (sin el genérico `<Database>`): `ai_agent_settings` no
 * está en `types/database.types.ts` — el CLI de Supabase no conecta en este
 * proyecto, ver CLAUDE.md § Supabase. Mismo patrón exacto que el `admin()` de
 * `lib/ai/conversation-memory.ts` y `lib/integrations/whatsapp/log.ts`.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * ¿Está prendido el análisis? FAIL-CLOSED, misma forma que los dos interruptores
 * de `lib/ai/scheduling-agent.ts` (`runSchedulingAgent`: `if (error || !data) →
 * noop`): "arranca apagado" también significa "si no estamos 100% seguros de que
 * está prendido, no se corre". Devuelve `false` ante error de PostgREST, fila
 * ausente, excepción de red, o columna que no llega (la migración todavía no
 * corrió) — nunca lanza.
 *
 * El `=== true` no es paranoia de estilo: si la migración no está aplicada en
 * ese entorno, el `select` falla y ya cortamos arriba; pero si algún día la
 * columna se vuelve nullable, un NULL tiene que leerse como APAGADO y no como
 * "truthy indefinido".
 */
async function analysisEnabled(): Promise<boolean> {
  try {
    const { data, error } = await admin()
      .from('ai_agent_settings')
      .select('analysis_enabled')
      .eq('id', true)
      .maybeSingle()
    if (error || !data) {
      console.warn(
        '[analyze-conversation] no se pudo leer ai_agent_settings.analysis_enabled — NO se analiza (fail-closed):',
        error?.message ?? 'sin fila de settings',
      )
      return false
    }
    return (data as { analysis_enabled?: boolean | null }).analysis_enabled === true
  } catch (err) {
    console.warn('[analyze-conversation] excepción leyendo el interruptor del análisis — NO se analiza (fail-closed):', err)
    return false
  }
}

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

/**
 * El transcripto que ve el modelo tiene que ser SOLO lo que el cliente
 * realmente vio — por eso el filtro `elClienteLoVio` (la lista blanca de
 * `countsAsReply`, la misma que rige en el endpoint de conversaciones, la
 * lista del Inbox y las métricas del hilo).
 *
 * Sin el filtro entraban acá, etiquetadas "[Nosotros]", las filas salientes que
 * NUNCA salieron: las notas internas del agente de IA ("Le paso la
 * conversación a una persona del equipo", "No pude registrar la visita"), los
 * envíos rebotados y los `skipped` del modo prueba. El modelo las leía como
 * mensajes que le habíamos mandado al cliente y resumía y priorizaba sobre
 * eso: el cliente "ya tenía respuesta" cuando en realidad seguía esperando.
 */
function buildUserPrompt(previousSummary: string, mensajesNuevos: WhatsappMessageLite[]): string {
  const visibles = mensajesNuevos.filter(elClienteLoVio)
  const lines = visibles.map(
    (m) => `[${m.direction === 'in' ? 'Cliente' : 'Nosotros'}] ${m.body_preview?.trim() || '(sin texto — multimedia o vacío)'}`,
  )
  return [
    `Resumen previo:\n${previousSummary.trim() || '(sin resumen previo — es el primer análisis de esta conversación)'}`,
    `Mensajes nuevos desde el último análisis (${visibles.length}):\n${lines.join('\n')}`,
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
  /** Texto EXACTO que el agente le manda al cliente. `null` = no contestar. Solo con el prompt de agente. */
  reply: string | null
  /** Día que el modelo propone para la visita (YYYY-MM-DD), SIN validar. Lo valida el código antes de agendar. */
  visitDate: string | null
  /** Hora en punto propuesta, SIN validar. */
  visitHour: number | null
  /** Material a mandar en este turno, o null. */
  send: 'fotos' | 'plano' | 'video' | null
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
    // El prompt de analista no redacta ni propone fecha: eso es del agente.
    reply: null,
    visitDate: null,
    visitHour: null,
    send: null,
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
  brain?: BrainInput,
): Promise<AnalysisPatch | null> {
  // UNA sola llamada, con uno de dos prompts. Con contexto de propiedad corre
  // el del AGENTE (entiende y CONTESTA); sin contexto, el de ANALISTA (solo
  // clasifica para ordenar la bandeja).
  const visibles = mensajesNuevos.filter(elClienteLoVio)
  const system = brain ? DEFAULT_AGENT_PROMPT : SYSTEM_PROMPT
  const user = brain
    ? buildBrainUserPrompt({
        ...brain,
        previousSummary,
        newMessages: visibles.map(m => ({
          from: m.direction === 'in' ? ('cliente' as const) : ('nosotros' as const),
          text: m.body_preview?.trim() || '(sin texto — multimedia o vacío)',
        })),
      })
    : buildUserPrompt(previousSummary, mensajesNuevos)

  const res = await chatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    jsonMode: true,
    maxTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
    timeoutMs: ANALYSIS_TIMEOUT_MS,
  })
  const parsed = JSON.parse(res.content) as unknown

  if (brain) {
    const d = coerceBrainDecision(parsed)
    if (!d) return null
    return {
      summary: d.summary,
      intent: d.intent,
      priorityScore: d.priorityScore,
      priorityReason: d.priorityReason,
      suggestedNextStep: d.suggestedNextStep,
      // `wantsToSchedule` queda por compatibilidad con el orden del Inbox.
      wantsToSchedule: d.intent === 'agendar',
      proposedSlot: null,
      reply: d.reply,
      visitDate: d.visitDate,
      visitHour: d.visitHour,
      send: d.send,
      tokensUsed: res.usage?.totalTokens ?? 0,
      model: res.model,
    }
  }

  const coerced = coerceAnalysisResult(parsed)
  if (!coerced) return null
  return { ...coerced, tokensUsed: res.usage?.totalTokens ?? 0, model: res.model }
}

/**
 * EXACTAMENTE UNA llamada al modelo por análisis, con techo de tiempo. NUNCA
 * lanza: cualquier excepción (red, parseo, API caída, timeout abortado) se
 * traga y devuelve `null` — "sin análisis nuevo", nunca un throw que tumbe al
 * caller.
 *
 * Antes había un reintento a OpenAI `gpt-4.1` cuando el JSON no validaba. Se
 * sacó: dos llamadas de IA seguidas dentro del POST del webhook es la receta
 * del 504 de Netlify (ver el encabezado del archivo). No perdemos nada — el
 * sistema está diseñado para vivir sin análisis, y el próximo mensaje del
 * cliente vuelve a intentar con el hilo un poco más largo.
 *
 * No decide POR SÍ SOLA si hay que analizar — eso es `debeAnalizar` (import
 * de `conversation-memory`). Este módulo asume que ya se decidió que sí, y
 * que `mensajesNuevos` no está vacío (si está vacío, no hay nada que mandarle
 * al modelo y devuelve `null` sin gastar una llamada). Ídem si lo único nuevo
 * son filas que el cliente nunca vio (notas internas del agente, envíos
 * fallidos): el transcripto quedaría vacío y la llamada sería plata tirada.
 *
 * ACÁ VIVE EL INTERRUPTOR DEL ANÁLISIS, y la elección del lugar es deliberada.
 * Los otros dos candidatos eran `runConversationAnalysis` (más abajo) y
 * `runAiPipeline` del webhook; los dos son CALLERS, y un caller solo se cubre a
 * sí mismo. `analyzeConversation` es el CHOKEPOINT: `askModel` es privada del
 * módulo y esta función es la única que la llama, así que no existe forma de
 * pegarle al modelo sin pasar por acá. Es la única variante que sigue siendo
 * verdadera cuando alguien agregue el año que viene un cron, un botón de
 * "re-analizar" en el Inbox o un backfill — ninguno se va a acordar de copiar el
 * chequeo, y con esto no hace falta que se acuerde.
 *
 * El costo del chequeo es una query, y va DESPUÉS del filtro de transcripto
 * vacío (que es gratis) para no pagarla cuando igual no había nada que analizar.
 */
export async function analyzeConversation(input: {
  previousSummary: string
  mensajesNuevos: WhatsappMessageLite[]
  brain?: BrainInput
}): Promise<AnalysisPatch | null> {
  if (input.mensajesNuevos.filter(elClienteLoVio).length === 0) return null

  if (!(await analysisEnabled())) return null

  try {
    return await askModel(input.previousSummary, input.mensajesNuevos, input.brain)
  } catch (err) {
    console.warn('[analyze-conversation] el modelo falló (se sigue sin análisis):', err)
    return null
  }
}

export interface RunConversationAnalysisResult {
  /** Estado ACTUAL (post-corrida). Si no se analizó o falló, es el estado previo intacto. `null` si no se pudo leer. */
  state: ConversationAiStateRow | null
  /** `true` solo si se pagó y persistió un análisis nuevo en esta corrida. */
  analyzed: boolean
  /**
   * `true` = no se pudo leer `conversation_ai_state`, así que esta corrida se
   * abortó a propósito. Distinto de `analyzed:false` por cooldown: acá NO se
   * sabe nada de la conversación y `state` no es confiable ni como "vacío".
   */
  readFailed: boolean
  /** Del análisis nuevo, si hubo. `false`/`null` si no se analizó — no implica que el cliente no quiera agendar, solo que no hay info nueva. */
  wantsToSchedule: boolean
  proposedSlot: string | null
  /** Lo que el agente contestaría. `null` = no contestar (o no corrió el prompt de agente). */
  reply: string | null
  /** Día propuesto por el modelo, SIN validar — lo valida `validateProposedVisit` antes de agendar. */
  visitDate: string | null
  /** Hora propuesta, SIN validar. */
  visitHour: number | null
  /** Material que el agente quiere mandar en este turno (fotos/plano/video), o null. */
  send: 'fotos' | 'plano' | 'video' | null
}

/**
 * Orquestador end-to-end para UNA conversación: lee estado + mensajes, aplica
 * el gate de costo (`debeAnalizar`), y si corresponde llama al modelo y
 * persiste. Pensado para que lo dispare el trigger natural (mensaje entrante
 * de WhatsApp) — ver CLAUDE.md § "La plantilla recorrido_acceso_v3 trae un
 * botón de respuesta rápida". NUNCA lanza en ningún paso.
 *
 * El interruptor `analysis_enabled` NO se chequea acá sino adentro de
 * `analyzeConversation` (ver el porqué en su comentario: es el chokepoint del
 * modelo, esto es apenas un caller). Con el interruptor apagado, el patch vuelve
 * `null` y esta función cae en el mismo camino que un modelo caído: `analyzed:
 * false`, estado anterior intacto, CERO escrituras — ni `saveConversationAiState`
 * ni nada. Río abajo el webhook hace `if (!analysis.analyzed) return`, así que el
 * agente que ESCRIBE tampoco se entera.
 */
export async function runConversationAnalysis(
  phoneE164: string,
  ahora: Date = new Date(),
  brain?: BrainInput,
): Promise<RunConversationAnalysisResult> {
  const [read, mensajes] = await Promise.all([
    getConversationAiState(phoneE164),
    getRecentWhatsappMessages(phoneE164),
  ])

  // FRENO DE MANO. Si la lectura falló no sabemos cuántos mensajes ya mandó el
  // agente ni si la conversación fue derivada a un humano: esos contadores
  // viven en la fila que no se pudo leer. Seguir con los defaults (0 mensajes,
  // sin derivar) es exactamente cómo un cliente que ya está en manos de una
  // persona se come otro WhatsApp del agente. Cortamos ANTES del modelo: el
  // webhook hace `if (!analysis.analyzed) return` y el agente ni se entera.
  // (Bonus: tampoco se pagan tokens de una corrida que no se va a poder
  // guardar bien.) Los otros dos interruptores del agente —`ai_agent_settings`
  // y `properties.ai_scheduling_enabled`— ya fallaban cerrados; a este se le
  // había pasado.
  if (read.readFailed) {
    return { state: null, analyzed: false, readFailed: true, wantsToSchedule: false, proposedSlot: null, reply: null, visitDate: null, visitHour: null, send: null }
  }

  const state = read.state

  if (!debeAnalizar(state, mensajes, ahora)) {
    return { state, analyzed: false, readFailed: false, wantsToSchedule: false, proposedSlot: null, reply: null, visitDate: null, visitHour: null, send: null }
  }

  const nuevos = mensajesNuevosDesde(state, mensajes)
  const patch = await analyzeConversation({ previousSummary: state?.summary ?? '', mensajesNuevos: nuevos, brain })
  if (!patch) {
    // Tres causas posibles, mismo desenlace a propósito: el interruptor está
    // apagado (o no se pudo leer), el modelo falló, o devolvió algo con forma
    // inválida. Nunca lanza y NO escribe: se deja el estado anterior sin tocar.
    // La conversación igual se ordena por la ventana de 24hs, que no necesita IA.
    return { state, analyzed: false, readFailed: false, wantsToSchedule: false, proposedSlot: null, reply: null, visitDate: null, visitHour: null, send: null }
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
    readFailed: false,
    wantsToSchedule: patch.wantsToSchedule,
    proposedSlot: patch.proposedSlot,
    reply: patch.reply,
    visitDate: patch.visitDate,
    visitHour: patch.visitHour,
    send: patch.send,
  }
}
