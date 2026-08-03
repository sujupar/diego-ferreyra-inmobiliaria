import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mensajesNuevosDesde,
  debeAnalizar,
  ANALYSIS_COOLDOWN_MS,
  SUMMARY_MAX_LENGTH,
  type ConversationAiStateRow,
  type WhatsappMessageLite,
} from './conversation-memory'

function msg(id: string, direction: 'in' | 'out', createdAt: string): WhatsappMessageLite {
  return { id, direction, body_preview: `msg ${id}`, status: direction === 'in' ? 'received' : 'sent', created_at: createdAt }
}

/**
 * Saliente que NUNCA salió hacia el cliente: la nota interna del agente de IA
 * (`agent_handoff` y compañía, constantes en `lib/ai/scheduling-agent.ts`), un
 * envío rebotado (`failed`) o uno que el modo prueba no llegó a mandar
 * (`skipped`).
 */
function nota(id: string, createdAt: string, status: string): WhatsappMessageLite {
  return { id, direction: 'out', body_preview: `nota ${id}`, status, created_at: createdAt }
}

function state(overrides: Partial<ConversationAiStateRow> = {}): ConversationAiStateRow {
  return {
    phone_e164: '5491122334455',
    summary: 'resumen previo',
    last_analyzed_message_id: null,
    last_analyzed_at: null,
    intent: 'desconocido',
    priority_score: 0,
    priority_reason: null,
    suggested_next_step: null,
    agent_messages_sent: 0,
    agent_handed_off: false,
    tokens_used_total: 0,
    analyses_count: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('mensajesNuevosDesde', () => {
  it('sin estado previo (nunca analizado) devuelve TODOS los mensajes, ordenados ascendente', () => {
    const m3 = msg('m3', 'in', '2026-08-01T00:03:00Z')
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const m2 = msg('m2', 'out', '2026-08-01T00:02:00Z')
    expect(mensajesNuevosDesde(null, [m3, m1, m2])).toEqual([m1, m2, m3])
  })

  it('con ancla presente en el array, devuelve solo lo posterior al mensaje analizado', () => {
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const m2 = msg('m2', 'out', '2026-08-01T00:02:00Z')
    const m3 = msg('m3', 'in', '2026-08-01T00:03:00Z')
    const s = state({ last_analyzed_message_id: 'm2', last_analyzed_at: '2026-08-01T00:02:00Z' })
    expect(mensajesNuevosDesde(s, [m1, m2, m3])).toEqual([m3])
  })

  it('si el mensaje analizado es el último, no hay nada nuevo', () => {
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const m2 = msg('m2', 'out', '2026-08-01T00:02:00Z')
    const s = state({ last_analyzed_message_id: 'm2', last_analyzed_at: '2026-08-01T00:02:00Z' })
    expect(mensajesNuevosDesde(s, [m1, m2])).toEqual([])
  })

  it('ancla NO presente en el array (podado/paginado): cae a comparar por last_analyzed_at', () => {
    // m1 (el ancla) ya no está en el array pasado, pero last_analyzed_at sigue sirviendo de corte.
    const m2 = msg('m2', 'out', '2026-08-01T00:02:00Z')
    const m3 = msg('m3', 'in', '2026-08-01T00:03:00Z')
    const s = state({ last_analyzed_message_id: 'm1-podado', last_analyzed_at: '2026-08-01T00:02:00Z' })
    expect(mensajesNuevosDesde(s, [m2, m3])).toEqual([m3])
  })

  it('mensajes vacíos → array vacío', () => {
    expect(mensajesNuevosDesde(null, [])).toEqual([])
    expect(mensajesNuevosDesde(state(), [])).toEqual([])
  })

  it('no muta el array de entrada', () => {
    const m2 = msg('m2', 'in', '2026-08-01T00:02:00Z')
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const input = [m2, m1]
    mensajesNuevosDesde(null, input)
    expect(input).toEqual([m2, m1]) // sigue en el orden original, no se reordenó in-place
  })
})

describe('debeAnalizar', () => {
  const ahora = new Date('2026-08-01T00:10:00Z')

  it('false si no hay mensajes nuevos (todo ya analizado)', () => {
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const s = state({ last_analyzed_message_id: 'm1', last_analyzed_at: '2026-08-01T00:01:00Z' })
    expect(debeAnalizar(s, [m1], ahora)).toBe(false)
  })

  it('false si no hay ningún mensaje en la conversación', () => {
    expect(debeAnalizar(null, [], ahora)).toBe(false)
  })

  it('false si el último mensaje de la conversación es nuestro, aunque haya "nuevos"', () => {
    // m1 (in) y m2 (out) son ambos nuevos (nunca se analizó), pero el último es 'out'.
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const m2 = msg('m2', 'out', '2026-08-01T00:02:00Z')
    expect(debeAnalizar(null, [m1, m2], ahora)).toBe(false)
  })

  it('false si se analizó hace menos de 2 minutos (anti-rebote), aunque haya mensaje nuevo del cliente', () => {
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const m2 = msg('m2', 'in', '2026-08-01T00:09:00Z') // nuevo, 1 min antes de "ahora"
    const s = state({ last_analyzed_message_id: 'm1', last_analyzed_at: '2026-08-01T00:09:00Z' })
    expect(debeAnalizar(s, [m1, m2], ahora)).toBe(false)
  })

  it('true si nunca se analizó y el último mensaje es del cliente', () => {
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    expect(debeAnalizar(null, [m1], ahora)).toBe(true)
  })

  it('true si hay mensaje nuevo del cliente y pasaron 2 minutos o más desde el último análisis', () => {
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const m2 = msg('m2', 'in', '2026-08-01T00:08:00Z')
    const s = state({ last_analyzed_message_id: 'm1', last_analyzed_at: '2026-08-01T00:08:00Z' })
    // ahora - last_analyzed_at = 00:10 - 00:08 = 2min exactos → NO es "menos de 2min" → permite
    expect(ahora.getTime() - new Date(s.last_analyzed_at!).getTime()).toBe(ANALYSIS_COOLDOWN_MS)
    expect(debeAnalizar(s, [m1, m2], ahora)).toBe(true)
  })

  // --- Notas internas: un saliente que nunca salió NO es "nosotros hablamos" ---
  // El gate miraba solo `direction`, así que una nota interna del agente
  // (`agent_handoff`) contaba como respuesta nuestra y frenaba el análisis
  // justo cuando el cliente seguía esperando y nadie le había contestado.

  it.each(['agent_handoff', 'agent_visit_pending', 'agent_visit_failed', 'agent_visit_unconfirmed', 'failed', 'skipped'])(
    'true si el último mensaje es un saliente que nunca salió (%s): el cliente sigue esperando',
    (status) => {
      const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
      const n1 = nota('n1', '2026-08-01T00:02:00Z', status)
      expect(debeAnalizar(null, [m1, n1], ahora)).toBe(true)
    },
  )

  it.each(['accepted', 'sent', 'delivered', 'read'])(
    'false si el último saliente SÍ salió de verdad (%s): ese caso legítimo no cambia',
    (status) => {
      const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
      const real: WhatsappMessageLite = {
        id: 'o1',
        direction: 'out',
        body_preview: 'ya te paso los datos',
        status,
        created_at: '2026-08-01T00:02:00Z',
      }
      expect(debeAnalizar(null, [m1, real], ahora)).toBe(false)
    },
  )

  it('false si lo único nuevo son notas internas: no hay nada del cliente que leer, no se paga el análisis', () => {
    // El entrante m1 ya está analizado; lo único posterior es una nota interna
    // que el cliente nunca vio. Pagar una llamada al modelo para leer eso es
    // tirar plata: el transcripto que le llegaría estaría vacío.
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    const n1 = nota('n1', '2026-08-01T00:02:00Z', 'agent_handoff')
    const s = state({ last_analyzed_message_id: 'm1', last_analyzed_at: '2026-08-01T00:01:00Z' })
    expect(debeAnalizar(s, [m1, n1], ahora)).toBe(false)
  })

  it('false un instante antes de los 2 minutos, true un instante después (borde exacto)', () => {
    const base = new Date('2026-08-01T00:00:00Z')
    const m1 = msg('m1', 'in', base.toISOString())
    const s = state({ last_analyzed_message_id: 'm1', last_analyzed_at: base.toISOString() })
    const m2 = msg('m2', 'in', new Date(base.getTime() + 1000).toISOString())

    const justBefore = new Date(base.getTime() + ANALYSIS_COOLDOWN_MS - 1)
    const justAfter = new Date(base.getTime() + ANALYSIS_COOLDOWN_MS + 1)

    expect(debeAnalizar(s, [m1, m2], justBefore)).toBe(false)
    expect(debeAnalizar(s, [m1, m2], justAfter)).toBe(true)
  })
})

describe('SUMMARY_MAX_LENGTH', () => {
  it('es 400 (tope duro documentado en el brief)', () => {
    expect(SUMMARY_MAX_LENGTH).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// I/O — mismo patrón que lib/leads/pipeline-state.test.ts: mockeamos
// @supabase/supabase-js para probar que las funciones NUNCA lanzan y hacen la
// query esperada, sin pegarle a una base real.
// ---------------------------------------------------------------------------

const stateMaybeSingle = vi.fn()
const stateEq = vi.fn(() => ({ maybeSingle: stateMaybeSingle }))
const stateSelect = vi.fn(() => ({ eq: stateEq }))
// Tipado explícito: sin esto TypeScript infiere `calls: []` y `error: null` a
// secas, y los tests que leen el payload del upsert o simulan un error de
// Supabase no compilan (aunque corran bien). El tipo describe la forma REAL de
// lo que hace el código: un upsert con (fila, opciones) que puede devolver error.
type UpsertRow = Record<string, unknown>
type UpsertOpts = { onConflict: string }
const stateUpsert = vi.fn<(row: UpsertRow, opts: UpsertOpts) => Promise<{ error: { message: string } | null }>>(
  () => Promise.resolve({ error: null }),
)

const messagesLimit = vi.fn()
const messagesOrder = vi.fn(() => ({ limit: messagesLimit }))
const messagesEq = vi.fn(() => ({ order: messagesOrder }))
const messagesSelect = vi.fn(() => ({ eq: messagesEq }))

const fromMock = vi.fn((table: string) => {
  if (table === 'conversation_ai_state') return { select: stateSelect, upsert: stateUpsert }
  if (table === 'whatsapp_messages') return { select: messagesSelect }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

describe('getConversationAiState (I/O)', () => {
  it('devuelve la fila cuando existe, con readFailed=false', async () => {
    const { getConversationAiState } = await import('./conversation-memory')
    const row = state()
    stateMaybeSingle.mockResolvedValueOnce({ data: row, error: null })
    const result = await getConversationAiState('5491122334455')
    expect(result).toEqual({ state: row, readFailed: false })
    expect(stateEq).toHaveBeenCalledWith('phone_e164', '5491122334455')
  })

  it('conversación nunca analizada (sin fila, sin error) NO es un fallo de lectura', async () => {
    // Distinción que sostiene el freno de mano: "no hay fila" es un estado
    // normal (primer mensaje del cliente) y el análisis tiene que seguir.
    const { getConversationAiState } = await import('./conversation-memory')
    stateMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    await expect(getConversationAiState('5491122334455')).resolves.toEqual({ state: null, readFailed: false })
  })

  it('error de Supabase → readFailed=true (no lanza, pero AVISA que no pudo leer)', async () => {
    const { getConversationAiState } = await import('./conversation-memory')
    stateMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(getConversationAiState('5491122334455')).resolves.toEqual({ state: null, readFailed: true })
  })

  it('excepción de red → readFailed=true (no lanza, pero AVISA que no pudo leer)', async () => {
    const { getConversationAiState } = await import('./conversation-memory')
    stateMaybeSingle.mockRejectedValueOnce(new Error('network down'))
    await expect(getConversationAiState('5491122334455')).resolves.toEqual({ state: null, readFailed: true })
  })
})

describe('getRecentWhatsappMessages (I/O)', () => {
  it('devuelve los mensajes ordenados ascendente', async () => {
    const { getRecentWhatsappMessages } = await import('./conversation-memory')
    const m2 = msg('m2', 'in', '2026-08-01T00:02:00Z')
    const m1 = msg('m1', 'in', '2026-08-01T00:01:00Z')
    messagesLimit.mockResolvedValueOnce({ data: [m2, m1], error: null })
    const result = await getRecentWhatsappMessages('5491122334455')
    expect(result).toEqual([m1, m2])
  })

  it('devuelve [] (no lanza) ante error', async () => {
    const { getRecentWhatsappMessages } = await import('./conversation-memory')
    messagesLimit.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(getRecentWhatsappMessages('5491122334455')).resolves.toEqual([])
  })
})

describe('saveConversationAiState (I/O)', () => {
  it('hace upsert con onConflict phone_e164 y trunca el summary a SUMMARY_MAX_LENGTH', async () => {
    const { saveConversationAiState } = await import('./conversation-memory')
    const largo = 'x'.repeat(500)
    await saveConversationAiState('5491122334455', {
      summary: largo,
      lastAnalyzedMessageId: 'm1',
      lastAnalyzedAt: '2026-08-01T00:10:00Z',
      intent: 'consulta',
      priorityScore: 80,
      priorityReason: 'preguntó por el precio',
      suggestedNextStep: 'responder con el precio',
      tokensUsedTotal: 123,
      analysesCount: 1,
    })
    expect(stateUpsert).toHaveBeenCalledTimes(1)
    const [payload, opts] = stateUpsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'phone_e164' })
    expect(payload.phone_e164).toBe('5491122334455')
    expect(payload.summary).toHaveLength(SUMMARY_MAX_LENGTH)
  })

  it('no lanza si el upsert falla', async () => {
    const { saveConversationAiState } = await import('./conversation-memory')
    stateUpsert.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(
      saveConversationAiState('5491122334455', {
        summary: 'x',
        lastAnalyzedMessageId: null,
        lastAnalyzedAt: '2026-08-01T00:10:00Z',
        intent: 'desconocido',
        priorityScore: 0,
        priorityReason: null,
        suggestedNextStep: null,
        tokensUsedTotal: 0,
        analysesCount: 1,
      }),
    ).resolves.toBeUndefined()
  })
})

// El bug que hacía parecer roto al agente: 12:16:19 pregunta, 12:16:27 el
// cliente contesta, y el anti-rebote de 2 minutos se comía la respuesta.
describe('debeAnalizar — la respuesta a una pregunta del agente NO espera el anti-rebote', () => {
  const T = (s: string) => `2026-08-03T12:${s}Z`
  const estado = { last_analyzed_at: T('16:14'), last_analyzed_message_id: 'm1' } as never

  const preguntaDelAgente = {
    id: 'm2', direction: 'out' as const, body_preview: '¿Qué día y a qué hora?',
    status: 'delivered', created_at: T('16:19'), ai_generated: true,
  }
  const respuesta = {
    id: 'm3', direction: 'in' as const, body_preview: 'Mañana',
    status: 'received', created_at: T('16:27'), ai_generated: false,
  }

  it('contesta a los 13 segundos y SE ANALIZA igual', () => {
    const hay = debeAnalizar(estado, [preguntaDelAgente, respuesta], new Date(T('16:28')))
    expect(hay).toBe(true)
  })

  it('sin pregunta del agente delante, el anti-rebote sigue frenando la ráfaga', () => {
    const salienteHumano = { ...preguntaDelAgente, ai_generated: false }
    const hay = debeAnalizar(estado, [salienteHumano, respuesta], new Date(T('16:28')))
    expect(hay).toBe(false)
  })

  it('pasados los 2 minutos se analiza igual, con o sin pregunta del agente', () => {
    const salienteHumano = { ...preguntaDelAgente, ai_generated: false }
    const hay = debeAnalizar(estado, [salienteHumano, respuesta], new Date('2026-08-03T12:19:00Z'))
    expect(hay).toBe(true)
  })
})
