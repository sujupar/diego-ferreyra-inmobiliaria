import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { WhatsappMessageLite, ConversationAiStateRow } from './conversation-memory'

// --- Mock del cliente de IA agnóstico. Mismo patrón que
// lib/leads/pipeline-state.test.ts (mock por vi.mock), pero acá el módulo
// mockeado es lib/ai/chat-client, no supabase-js.
const chatCompletionMock = vi.fn()
vi.mock('@/lib/ai/chat-client', () => ({
  chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
}))

// --- Mock de Supabase: acá vive UNA sola lectura, la del interruptor del
// análisis (`ai_agent_settings.analysis_enabled`). El resto del I/O de este
// módulo pasa por `conversation-memory`, que se mockea aparte más abajo.
// `settingsRead` devuelve el `{data, error}` crudo de PostgREST para poder
// simular los tres fracasos que importan: apagado, error de lectura y excepción.
const settingsRead = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const self = () => q
      q.select = self
      q.eq = self
      q.maybeSingle = () => settingsRead(table)
      return q
    },
  }),
}))

/** Interruptor prendido: es el estado que asumen los tests de comportamiento normal. */
function analisisPrendido() {
  settingsRead.mockResolvedValue({ data: { analysis_enabled: true }, error: null })
}

// --- Mock parcial de conversation-memory: las funciones PURAS se dejan
// reales (importActual) porque son las que ya están testeadas a fondo en
// conversation-memory.test.ts y acá queremos ejercitarlas de verdad dentro
// del orquestador; las de I/O se mockean para no pegarle a Supabase.
const getConversationAiStateMock = vi.fn()
const getRecentWhatsappMessagesMock = vi.fn()
const saveConversationAiStateMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/ai/conversation-memory', async () => {
  const actual = await vi.importActual<typeof import('./conversation-memory')>('./conversation-memory')
  return {
    ...actual,
    getConversationAiState: (...args: unknown[]) => getConversationAiStateMock(...args),
    getRecentWhatsappMessages: (...args: unknown[]) => getRecentWhatsappMessagesMock(...args),
    saveConversationAiState: (...args: unknown[]) => saveConversationAiStateMock(...args),
  }
})

const {
  analyzeConversation,
  coerceAnalysisResult,
  runConversationAnalysis,
} = await import('./analyze-conversation')

function msg(id: string, direction: 'in' | 'out', createdAt: string, body = `texto ${id}`): WhatsappMessageLite {
  return { id, direction, body_preview: body, status: direction === 'in' ? 'received' : 'sent', created_at: createdAt }
}

/**
 * Saliente que NUNCA salió hacia el cliente: la nota interna del agente de IA
 * (`agent_handoff` y compañía), un envío rebotado (`failed`) o uno que el modo
 * prueba no llegó a mandar (`skipped`).
 */
function nota(id: string, createdAt: string, status: string, body = `nota interna ${id}`): WhatsappMessageLite {
  return { id, direction: 'out', body_preview: body, status, created_at: createdAt }
}

/** El texto exacto que se le manda al modelo (el `user` de la única llamada). */
function promptEnviado(): string {
  return chatCompletionMock.mock.calls[0][0].messages[1].content as string
}

function chatResult(content: unknown, opts: Partial<{ model: string; provider: string; usage: { totalTokens: number } }> = {}) {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    provider: opts.provider ?? 'deepseek',
    model: opts.model ?? 'deepseek-chat',
    usage: opts.usage ?? { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  }
}

const VALID_ANALYSIS = {
  summary: 'Cliente preguntó por el precio de la propiedad de Palermo.',
  intent: 'consulta',
  priorityScore: 70,
  priorityReason: 'Preguntó el precio, hay que responderle pronto',
  suggestedNextStep: 'Mandarle el precio y disponibilidad',
  wantsToSchedule: false,
  proposedSlot: null,
}

beforeEach(() => {
  // `resetAllMocks`, no `clearAllMocks`: `clear` borra las llamadas pero NO la
  // cola de `mockResolvedValueOnce`. Desde que el análisis hace UNA sola
  // llamada al modelo, los `Once` de más que encolan varios tests quedaban sin
  // consumir y se los comía el test siguiente — falsos rojos y, peor, falsos
  // verdes.
  vi.resetAllMocks()
  saveConversationAiStateMock.mockResolvedValue(undefined)
  // Por default el interruptor está PRENDIDO en los tests: así los casos de
  // comportamiento (los que ya existían) siguen ejercitando el camino real, y
  // cada test del freno lo apaga explícitamente. En producción es al revés — el
  // default de la columna es `false` (migración 20260803000006).
  analisisPrendido()
})

describe('coerceAnalysisResult (pura)', () => {
  it('acepta un resultado bien formado', () => {
    const result = coerceAnalysisResult(VALID_ANALYSIS)
    // El prompt de ANALISTA no redacta ni propone fecha — eso es del prompt de
    // AGENTE (`coerceBrainDecision`), que es otro camino.
    expect(result).toEqual({ ...VALID_ANALYSIS, reply: null, visitDate: null, visitHour: null, send: null })
  })

  it('null si falta summary', () => {
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, summary: '' })).toBeNull()
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, summary: undefined })).toBeNull()
  })

  it('null si falta priorityReason', () => {
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, priorityReason: '' })).toBeNull()
  })

  it('null si el raw no es un objeto', () => {
    expect(coerceAnalysisResult(null)).toBeNull()
    expect(coerceAnalysisResult('texto')).toBeNull()
    expect(coerceAnalysisResult(42)).toBeNull()
  })

  it('intent inválido cae a "desconocido" en vez de invalidar todo', () => {
    const result = coerceAnalysisResult({ ...VALID_ANALYSIS, intent: 'urgentisimo' })
    expect(result?.intent).toBe('desconocido')
  })

  it('trunca el summary a SUMMARY_MAX_LENGTH (400)', () => {
    const largo = 'a'.repeat(500)
    const result = coerceAnalysisResult({ ...VALID_ANALYSIS, summary: largo })
    expect(result?.summary).toHaveLength(400)
  })

  it('clampea priorityScore fuera de rango (0-100)', () => {
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, priorityScore: 500 })?.priorityScore).toBe(100)
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, priorityScore: -20 })?.priorityScore).toBe(0)
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, priorityScore: 'no-es-numero' })?.priorityScore).toBe(0)
  })

  it('proposedSlot vacío o ausente se normaliza a null', () => {
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, proposedSlot: '' })?.proposedSlot).toBeNull()
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, proposedSlot: undefined })?.proposedSlot).toBeNull()
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, proposedSlot: '  mañana a la tarde  ' })?.proposedSlot).toBe(
      'mañana a la tarde',
    )
  })

  it('wantsToSchedule no-boolean se normaliza a false', () => {
    expect(coerceAnalysisResult({ ...VALID_ANALYSIS, wantsToSchedule: 'si' })?.wantsToSchedule).toBe(false)
  })
})

describe('analyzeConversation', () => {
  const nuevos = [msg('m1', 'in', '2026-08-01T00:01:00Z', '¿cuánto sale?')]

  it('vacío de mensajes nuevos → null sin llamar al modelo (no gasta nada)', async () => {
    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: [] })
    expect(result).toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('primer intento (DeepSeek) válido → devuelve el patch con tokensUsed y NO reintenta', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    const result = await analyzeConversation({ previousSummary: 'resumen', mensajesNuevos: nuevos })
    expect(result).toMatchObject({ ...VALID_ANALYSIS, tokensUsed: 150, model: 'deepseek-chat' })
    expect(chatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('JSON inválido → null SIN una segunda llamada al modelo (una sola IA por request)', async () => {
    // Encadenar un reintento a otro modelo acá adentro es lo que hace que el
    // POST del webhook se pase de los ~26s de Netlify. Ver CLAUDE.md § "nunca
    // encadenar varias llamadas de IA dentro de UN request".
    chatCompletionMock
      .mockResolvedValueOnce(chatResult('esto no es JSON'))
      .mockResolvedValueOnce(chatResult(VALID_ANALYSIS, { model: 'gpt-4.1', provider: 'openai' }))

    const result = await analyzeConversation({ previousSummary: 'resumen', mensajesNuevos: nuevos })

    expect(result).toBeNull()
    expect(chatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('esquema incompleto (JSON válido pero sin priorityReason) → null, tampoco reintenta', async () => {
    chatCompletionMock
      .mockResolvedValueOnce(chatResult({ ...VALID_ANALYSIS, priorityReason: '' }))
      .mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })
    expect(result).toBeNull()
    expect(chatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('NUNCA lanza: excepción de red (o timeout abortado) → null, sin segunda llamada', async () => {
    chatCompletionMock.mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new Error('timeout'))
    await expect(analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })).resolves.toBeNull()
    expect(chatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('pasa un techo duro de tokens de output en la llamada', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })
    const callArgs = chatCompletionMock.mock.calls[0][0]
    expect(typeof callArgs.maxTokens).toBe('number')
    expect(callArgs.maxTokens).toBeGreaterThan(0)
  })

  it('pasa un techo de TIEMPO a la llamada, por debajo del corte de Netlify (~26s)', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })
    const callArgs = chatCompletionMock.mock.calls[0][0]
    expect(typeof callArgs.timeoutMs).toBe('number')
    expect(callArgs.timeoutMs).toBeGreaterThan(0)
    expect(callArgs.timeoutMs).toBeLessThanOrEqual(15_000)
  })

  it('sin usage en la respuesta del proveedor, tokensUsed cae a 0 (no explota)', async () => {
    chatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify(VALID_ANALYSIS),
      provider: 'deepseek',
      model: 'deepseek-chat',
      usage: undefined,
    })
    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })
    expect(result?.tokensUsed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// EL INTERRUPTOR DEL ANÁLISIS (`ai_agent_settings.analysis_enabled`, migración
// 20260803000006). Arranca APAGADO y es fail-closed, igual que los dos
// interruptores de `scheduling-agent.ts`.
//
// Por qué se testea tan a fondo: el análisis corre pegado al webhook de WhatsApp
// y le pega al modelo por CADA mensaje entrante, con la API key ya configurada
// en producción. Sin este freno, un merge a main prendía el gasto de IA sobre
// clientes reales sin que nadie lo decidiera. La regla es una sola: si no
// estamos 100% seguros de que está prendido, no se llama al modelo ni se
// escribe nada.
// ---------------------------------------------------------------------------
describe('interruptor del análisis (fail-closed)', () => {
  const nuevos = [msg('m1', 'in', '2026-08-01T00:01:00Z', 'hola, ¿podemos coordinar?')]

  it('APAGADO → null, sin llamar al modelo', async () => {
    settingsRead.mockResolvedValue({ data: { analysis_enabled: false }, error: null })

    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })

    expect(result).toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('la lectura del interruptor FALLA → igual que apagado (nunca asume "prendido")', async () => {
    settingsRead.mockResolvedValue({ data: null, error: { message: 'PostgREST caído' } })

    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })

    expect(result).toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('sin fila de settings (tabla vacía) → apagado', async () => {
    settingsRead.mockResolvedValue({ data: null, error: null })

    expect(await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })).toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('la lectura LANZA (red caída) → apagado, y no propaga la excepción', async () => {
    settingsRead.mockRejectedValue(new Error('ECONNRESET'))

    await expect(analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })).resolves.toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('columna ausente en la respuesta (migración sin correr) → apagado, no "truthy indefinido"', async () => {
    settingsRead.mockResolvedValue({ data: { max_messages_per_conversation: 3 }, error: null })

    expect(await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })).toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('PRENDIDO → se comporta como siempre (una llamada al modelo, patch completo)', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))

    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })

    expect(result).toMatchObject({ ...VALID_ANALYSIS, tokensUsed: 150 })
    expect(chatCompletionMock).toHaveBeenCalledTimes(1)
  })

  it('transcripto vacío: ni siquiera se paga la query del interruptor', async () => {
    // El filtro gratis va PRIMERO. Si no había nada que analizar, tampoco hay
    // por qué ir a la base a preguntar si se puede analizar.
    const result = await analyzeConversation({ previousSummary: '', mensajesNuevos: [] })

    expect(result).toBeNull()
    expect(settingsRead).not.toHaveBeenCalled()
  })

  it('el interruptor se lee de ai_agent_settings, no de otra tabla', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    await analyzeConversation({ previousSummary: '', mensajesNuevos: nuevos })
    expect(settingsRead).toHaveBeenCalledWith('ai_agent_settings')
  })
})

// ---------------------------------------------------------------------------
// El transcripto que ve el modelo = SOLO lo que el cliente realmente vio.
// Las notas internas del agente ("Le paso la conversación a una persona del
// equipo", "No pude registrar la visita") son filas salientes que nunca
// salieron por la API de Meta; si entran al prompt etiquetadas "[Nosotros]",
// el modelo resume y prioriza sobre mensajes que el cliente nunca recibió.
// ---------------------------------------------------------------------------
describe('buildUserPrompt (vía analyzeConversation): qué ve el modelo', () => {
  it('la nota interna del agente NO entra al transcripto, el mensaje del cliente sí', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    await analyzeConversation({
      previousSummary: '',
      mensajesNuevos: [
        msg('m1', 'in', '2026-08-01T00:01:00Z', '¿podemos coordinar una visita?'),
        nota('n1', '2026-08-01T00:02:00Z', 'agent_handoff', 'Le paso la conversación a una persona del equipo'),
      ],
    })

    const prompt = promptEnviado()
    expect(prompt).toContain('¿podemos coordinar una visita?')
    expect(prompt).not.toContain('Le paso la conversación a una persona del equipo')
    // Y el conteo que se le declara al modelo tiene que ser el de lo que ve,
    // no el del array crudo — si no, "dice 2 y muestra 1".
    expect(prompt).toContain('(1)')
  })

  it.each(['agent_visit_pending', 'agent_visit_failed', 'agent_visit_unconfirmed', 'failed', 'skipped'])(
    'un saliente en estado %s tampoco entra al transcripto',
    async (status) => {
      chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
      await analyzeConversation({
        previousSummary: '',
        mensajesNuevos: [
          msg('m1', 'in', '2026-08-01T00:01:00Z', 'hola'),
          nota('n1', '2026-08-01T00:02:00Z', status, 'ESTO-NO-SALIO-NUNCA'),
        ],
      })
      expect(promptEnviado()).not.toContain('ESTO-NO-SALIO-NUNCA')
    },
  )

  it('un saliente REAL (sent) sí entra, etiquetado como nuestro', async () => {
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))
    await analyzeConversation({
      previousSummary: '',
      mensajesNuevos: [
        msg('m1', 'in', '2026-08-01T00:01:00Z', 'hola'),
        msg('o1', 'out', '2026-08-01T00:02:00Z', 'te mando el precio'),
      ],
    })
    expect(promptEnviado()).toContain('[Nosotros] te mando el precio')
  })

  it('si TODO lo nuevo son notas internas, no se llama al modelo (transcripto vacío = llamada tirada)', async () => {
    const result = await analyzeConversation({
      previousSummary: 'resumen',
      mensajesNuevos: [nota('n1', '2026-08-01T00:02:00Z', 'agent_handoff')],
    })
    expect(result).toBeNull()
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })
})

describe('runConversationAnalysis (orquestador end-to-end)', () => {
  function baseState(overrides: Partial<ConversationAiStateRow> = {}): ConversationAiStateRow {
    return {
      phone_e164: '5491122334455',
      summary: 'resumen viejo',
      last_analyzed_message_id: 'm1',
      last_analyzed_at: '2026-08-01T00:00:00Z',
      intent: 'desconocido',
      priority_score: 10,
      priority_reason: null,
      suggested_next_step: null,
      agent_messages_sent: 0,
      agent_handed_off: false,
      tokens_used_total: 50,
      analyses_count: 1,
      created_at: '2026-07-31T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      ...overrides,
    }
  }

  /** Lectura OK de `getConversationAiState`: `state` puede ser null (nunca analizada). */
  function readOk(s: ConversationAiStateRow | null) {
    return { state: s, readFailed: false }
  }

  it('no analiza (no llama al modelo) cuando debeAnalizar da false — ej. último mensaje es nuestro', async () => {
    getConversationAiStateMock.mockResolvedValueOnce(readOk(null))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([msg('m1', 'out', '2026-08-01T00:01:00Z')])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:05:00Z'))

    expect(result.analyzed).toBe(false)
    expect(chatCompletionMock).not.toHaveBeenCalled()
    expect(saveConversationAiStateMock).not.toHaveBeenCalled()
  })

  it('no analiza dentro del cooldown de 2 minutos', async () => {
    const s = baseState({ last_analyzed_at: '2026-08-01T00:04:00Z', last_analyzed_message_id: 'm1' })
    getConversationAiStateMock.mockResolvedValueOnce(readOk(s))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z'),
      msg('m2', 'in', '2026-08-01T00:04:30Z'),
    ])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:05:00Z'))

    expect(result.analyzed).toBe(false)
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  it('analiza, persiste y acumula tokens_used_total y analyses_count', async () => {
    const s = baseState()
    getConversationAiStateMock.mockResolvedValueOnce(readOk(s))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z'),
      msg('m2', 'in', '2026-08-01T00:03:00Z', 'quiero agendar una visita'),
    ])
    chatCompletionMock.mockResolvedValueOnce(
      chatResult({ ...VALID_ANALYSIS, intent: 'agendar', wantsToSchedule: true, proposedSlot: 'sábado a la tarde' }),
    )

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(true)
    expect(result.wantsToSchedule).toBe(true)
    expect(result.proposedSlot).toBe('sábado a la tarde')
    expect(result.state?.tokens_used_total).toBe(50 + 150) // acumulado, no pisado
    expect(result.state?.analyses_count).toBe(2)
    expect(result.state?.last_analyzed_message_id).toBe('m2')

    expect(saveConversationAiStateMock).toHaveBeenCalledTimes(1)
    const savedPatch = saveConversationAiStateMock.mock.calls[0][1]
    expect(savedPatch.tokensUsedTotal).toBe(200)
    expect(savedPatch.analysesCount).toBe(2)
    expect(savedPatch.lastAnalyzedMessageId).toBe('m2')
  })

  it('NUNCA lanza: si analyzeConversation falla, deja el estado anterior intacto (no persiste)', async () => {
    const s = baseState()
    getConversationAiStateMock.mockResolvedValueOnce(readOk(s))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z'),
      msg('m2', 'in', '2026-08-01T00:03:00Z'),
    ])
    chatCompletionMock.mockRejectedValueOnce(new Error('modelo caído')).mockRejectedValueOnce(new Error('modelo caído'))

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(false)
    expect(result.state).toEqual(s) // estado anterior, sin tocar
    expect(saveConversationAiStateMock).not.toHaveBeenCalled()
  })

  it('primera vez (sin estado previo) con mensaje entrante único: analiza igual', async () => {
    getConversationAiStateMock.mockResolvedValueOnce(readOk(null))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([msg('m1', 'in', '2026-08-01T00:00:00Z', 'hola, me interesa')])
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:01:00Z'))

    expect(result.analyzed).toBe(true)
    expect(result.readFailed).toBe(false)
    expect(result.state?.analyses_count).toBe(1)
    expect(result.state?.tokens_used_total).toBe(150)
  })

  it('hilo cuyo último saliente es una nota interna: SÍ analiza, y la nota no llega al modelo', async () => {
    // El agente se rindió y dejó su nota interna. Para el cliente eso no
    // existió: sigue esperando respuesta desde su mensaje. El análisis tiene
    // que correr (antes el gate lo daba por "nosotros ya contestamos") y el
    // modelo tiene que ver solo lo que el cliente vio.
    getConversationAiStateMock.mockResolvedValueOnce(readOk(null))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z', 'quiero ver el depto el sábado'),
      {
        id: 'n1',
        direction: 'out' as const,
        body_preview: 'Le paso la conversación a una persona del equipo',
        status: 'agent_handoff',
        created_at: '2026-08-01T00:01:00Z',
      },
    ])
    chatCompletionMock.mockResolvedValueOnce(chatResult({ ...VALID_ANALYSIS, wantsToSchedule: true }))

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(true)
    const prompt = promptEnviado()
    expect(prompt).toContain('quiero ver el depto el sábado')
    expect(prompt).not.toContain('Le paso la conversación a una persona del equipo')
  })

  it('hilo cuyo último saliente es REAL: sigue sin analizar (el caso legítimo no cambia)', async () => {
    getConversationAiStateMock.mockResolvedValueOnce(readOk(null))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z', 'quiero ver el depto'),
      msg('o1', 'out', '2026-08-01T00:01:00Z', 'dale, te confirmo el horario'),
    ])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(false)
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })

  // --- El freno de mano: ante un error de LECTURA no se sigue de largo -------
  // Si no se pudo leer `conversation_ai_state`, no sabemos cuántos mensajes ya
  // mandó el agente ni si la conversación fue derivada a un humano. Seguir con
  // los defaults (0 mensajes, sin derivar) es exactamente cómo un cliente que
  // ya está en manos de una persona recibe un WhatsApp de más.

  it('lectura FALLIDA del estado → analyzed:false + readFailed:true, sin llamar al modelo ni escribir', async () => {
    getConversationAiStateMock.mockResolvedValueOnce({ state: null, readFailed: true })
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z', 'hola, ¿podemos coordinar?'),
    ])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(false)
    expect(result.readFailed).toBe(true)
    expect(result.state).toBeNull() // NO inventamos un estado vacío: no sabemos nada
    expect(chatCompletionMock).not.toHaveBeenCalled() // ni gastamos tokens
    expect(saveConversationAiStateMock).not.toHaveBeenCalled()
  })

  // --- El interruptor, visto desde el orquestador --------------------------
  // Lo que importa río abajo: `analyzed:false` es lo que hace que el webhook
  // corte antes del agente que ESCRIBE (`if (!analysis.analyzed) return`).

  it('interruptor APAGADO: hilo perfectamente analizable → analyzed:false, sin modelo y SIN escribir', async () => {
    settingsRead.mockResolvedValue({ data: { analysis_enabled: false }, error: null })
    getConversationAiStateMock.mockResolvedValueOnce(readOk(baseState()))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z'),
      msg('m2', 'in', '2026-08-01T00:03:00Z', 'quiero agendar una visita'),
    ])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(false)
    expect(result.wantsToSchedule).toBe(false) // el agente que escribe no recibe nada
    expect(chatCompletionMock).not.toHaveBeenCalled()
    expect(saveConversationAiStateMock).not.toHaveBeenCalled()
  })

  it('interruptor APAGADO: el estado previo queda INTACTO (no se pisa con un vacío)', async () => {
    settingsRead.mockResolvedValue({ data: { analysis_enabled: false }, error: null })
    const s = baseState()
    getConversationAiStateMock.mockResolvedValueOnce(readOk(s))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z'),
      msg('m2', 'in', '2026-08-01T00:03:00Z'),
    ])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.state).toEqual(s)
    expect(result.readFailed).toBe(false) // no es un fallo de lectura del estado: es "está apagado"
  })

  it('interruptor ILEGIBLE: mismo desenlace que apagado (fail-closed end-to-end)', async () => {
    settingsRead.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    getConversationAiStateMock.mockResolvedValueOnce(readOk(null))
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z', 'quiero ver el depto mañana a la tarde'),
    ])

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(false)
    expect(chatCompletionMock).not.toHaveBeenCalled()
    expect(saveConversationAiStateMock).not.toHaveBeenCalled()
  })

  it('lectura fallida corta ANTES de decidir: aunque el hilo pareciera analizable, no analiza', async () => {
    // Mismo hilo que el caso feliz de más arriba (mensaje entrante fresco, sin
    // cooldown). La única diferencia es que la lectura falló.
    getConversationAiStateMock.mockResolvedValueOnce({ state: null, readFailed: true })
    getRecentWhatsappMessagesMock.mockResolvedValueOnce([
      msg('m1', 'in', '2026-08-01T00:00:00Z'),
      msg('m2', 'in', '2026-08-01T00:03:00Z', 'quiero agendar una visita'),
    ])
    chatCompletionMock.mockResolvedValueOnce(chatResult(VALID_ANALYSIS))

    const result = await runConversationAnalysis('5491122334455', new Date('2026-08-01T00:10:00Z'))

    expect(result.analyzed).toBe(false)
    expect(result.wantsToSchedule).toBe(false)
    expect(chatCompletionMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// La migración `20260803000006_ai_analysis_switch.sql`.
//
// LO QUE ESTE BLOQUE PUEDE Y NO PUEDE PROBAR: no corre SQL (la aplica el
// orquestador contra la base real), así que no prueba que la migración FUNCIONE.
// Lo que sí fija —y es lo que se puede romper de un editor a otro sin que nadie
// lo note— son sus dos invariantes de seguridad:
//
//   1. Es ADITIVA sobre `ai_agent_settings`: agrega la columna del interruptor
//      con default `false` y NO toca `scheduling_enabled` ni ninguna otra fila.
//   2. La ÚNICA escritura sobre datos —apagar las 41 propiedades— corre UNA VEZ
//      y queda encerrada en el guard. Un `UPDATE properties` suelto acá afuera
//      apagaría, en cada re-ejecución del archivo, la propiedad que el dueño
//      acaba de prender para probar. Los scripts `apply-*-pg.ts` de este repo
//      re-ejecutan migraciones enteras: no es una hipótesis.
// ---------------------------------------------------------------------------
describe('migración 20260803000006 (interruptor del análisis + apagar las propiedades)', () => {
  const crudo = readFileSync(
    fileURLToPath(new URL('../../supabase/migrations/20260803000006_ai_analysis_switch.sql', import.meta.url)),
    'utf8',
  )
  /**
   * Sin los comentarios `--`. Hace falta de verdad: el archivo documenta EN
   * PROSA el `UPDATE properties SET ai_scheduling_enabled = true` que hay que
   * correr a mano para estrenar, y un grep ingenuo lo contaría como una
   * escritura del archivo. Lo que se audita acá es lo que Postgres EJECUTA.
   */
  const sql = crudo.replace(/--.*$/gm, '')

  it('agrega analysis_enabled con default false, de forma aditiva', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS analysis_enabled BOOLEAN NOT NULL DEFAULT false/)
  })

  it('NO toca el otro interruptor ni ninguna fila de ai_agent_settings', () => {
    expect(sql).not.toMatch(/UPDATE\s+ai_agent_settings/i)
    // El lookbehind es necesario: `ai_scheduling_enabled` (la columna POR
    // PROPIEDAD, que esta migración sí toca) termina en `scheduling_enabled`.
    // Lo que no se puede tocar es el interruptor GLOBAL del que escribe.
    expect(sql).not.toMatch(/(?<!ai_)scheduling_enabled\s*=/i)
    // Lo único que se le hace a esa tabla es agregar la columna nueva.
    const alters = sql.match(/ALTER\s+TABLE\s+ai_agent_settings[\s\S]*?;/gi) ?? []
    expect(alters).toHaveLength(1)
    expect(alters[0]).toMatch(/ADD COLUMN IF NOT EXISTS analysis_enabled/)
  })

  it('baja el default de properties.ai_scheduling_enabled a false', () => {
    expect(sql).toMatch(/ALTER COLUMN ai_scheduling_enabled SET DEFAULT false/)
  })

  it('apaga las filas existentes, y ese UPDATE vive DENTRO del guard de una sola corrida', () => {
    const updates = sql.match(/UPDATE\s+properties[^;]*;/gi) ?? []
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatch(/SET ai_scheduling_enabled = false/)

    // El guard: el UPDATE tiene que caer entre el `DO $$` y su `END $$`, y el
    // bloque tiene que condicionarse al default viejo (la marca de "todavía no
    // corrió"). Sin esto, re-ejecutar el archivo apaga lo que el dueño prendió.
    const guard = sql.slice(sql.indexOf('DO $$'), sql.indexOf('END $$'))
    expect(guard).toContain(updates[0])
    expect(guard).toMatch(/information_schema\.columns/)
    expect(guard).toMatch(/column_default = 'true'/)
  })

  it('no borra nada (ni tablas, ni columnas, ni políticas)', () => {
    expect(sql).not.toMatch(/\bDROP\b/i)
  })
})
