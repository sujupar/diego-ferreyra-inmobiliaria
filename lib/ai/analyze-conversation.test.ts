import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WhatsappMessageLite, ConversationAiStateRow } from './conversation-memory'

// --- Mock del cliente de IA agnóstico. Mismo patrón que
// lib/leads/pipeline-state.test.ts (mock por vi.mock), pero acá el módulo
// mockeado es lib/ai/chat-client, no supabase-js.
const chatCompletionMock = vi.fn()
vi.mock('@/lib/ai/chat-client', () => ({
  chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
}))

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
})

describe('coerceAnalysisResult (pura)', () => {
  it('acepta un resultado bien formado', () => {
    const result = coerceAnalysisResult(VALID_ANALYSIS)
    expect(result).toEqual(VALID_ANALYSIS)
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
