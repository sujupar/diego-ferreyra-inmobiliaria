/**
 * Tests del agrupador de `GET /api/whatsapp/conversations`.
 *
 * Lo único que se moquea es lo que toca el mundo real (auth y Supabase); la
 * lógica de agrupación —que es donde vivía el bug— corre de verdad.
 *
 * Contexto del caso que motivó estos tests: cuando el agente de IA llega al
 * tope de mensajes deja una nota INTERNA (`direction:'out'`,
 * `status:'agent_handoff'`) que NUNCA sale por la API de Meta. El agrupador la
 * contaba como respuesta al cliente y la conversación desaparecía del filtro
 * "Sin responder" justo cuando hacía falta que la atendiera una persona.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Array<Record<string, unknown>>,
    /** Filas de `conversation_ai_state` — memoria de la IA + freno del agente. */
    aiRows: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: 'admin' } })),
}))

vi.mock('@supabase/supabase-js', () => {
  // Query builder mínimo y encadenable. Las queries con `{ head: true }` son
  // los conteos de `checkWebhookNotSubscribed`; las tablas que no se declaran
  // acá (leads/etiquetas/propiedades/perfiles) devuelven vacío.
  function builder(table: string) {
    const q: Record<string, unknown> & { then?: unknown } = {}
    let head = false
    const self = () => q
    q.select = (_cols: string, opts?: { head?: boolean }) => {
      head = !!opts?.head
      return q
    }
    q.order = self
    q.limit = self
    q.eq = self
    q.in = self
    q.is = self
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const porTabla: Record<string, Array<Record<string, unknown>>> = {
        whatsapp_messages: state.rows,
        conversation_ai_state: state.aiRows,
      }
      const result = head ? { count: 0, error: null } : { data: porTabla[table] ?? [], error: null }
      return Promise.resolve(result).then(resolve, reject)
    }
    return q
  }
  return { createClient: () => ({ from: (table: string) => builder(table) }) }
})

import { GET } from './route'

const PHONE = '5491122334455'
const INBOUND_AT = '2026-08-03T10:00:00.000Z'
const OUTBOUND_AT = '2026-08-03T10:05:00.000Z'

function inbound() {
  return {
    id: 'in-1',
    direction: 'in',
    phone_e164: PHONE,
    contact_name: 'Cliente',
    lead_id: null,
    property_id: null,
    body_preview: '¿Puedo verlo el sábado?',
    status: 'received',
    created_at: INBOUND_AT,
  }
}

function outbound(status: string) {
  return {
    id: 'out-1',
    direction: 'out',
    phone_e164: PHONE,
    contact_name: null,
    lead_id: null,
    property_id: null,
    body_preview: 'texto',
    status,
    created_at: OUTBOUND_AT,
  }
}

/** Fila de `conversation_ai_state` — por default, SIN análisis (`last_analyzed_at` null). */
function aiState(over: Record<string, unknown> = {}) {
  return {
    phone_e164: PHONE,
    intent: 'desconocido',
    priority_score: 0,
    priority_reason: null,
    suggested_next_step: null,
    last_analyzed_at: null,
    agent_handed_off: false,
    ...over,
  }
}

interface ConversacionDeRespuesta {
  awaiting_reply_since: string | null
  agent_off: boolean
  ai: { intent: string; priorityScore: number } | null
  priority: { analyzed: boolean; score: number }
}

/** `allRows` llega ordenado desc por `created_at` (lo garantiza el `.order()` de la query real). */
async function conversations(rows: Array<Record<string, unknown>>, query = '') {
  state.rows = rows
  const res = await GET({ url: `http://localhost/api/whatsapp/conversations${query}` } as unknown as Request)
  const json = (await res.json()) as { data: ConversacionDeRespuesta[] }
  return json.data
}

describe('GET /api/whatsapp/conversations — awaiting_reply_since', () => {
  beforeEach(() => {
    state.rows = []
    state.aiRows = []
  })

  it('la nota interna de derivación a humano (agent_handoff) NO cuenta como respuesta', async () => {
    const data = await conversations([outbound('agent_handoff'), inbound()])
    expect(data).toHaveLength(1)
    expect(data[0].awaiting_reply_since).toBe(INBOUND_AT)
  })

  it('con agent_handoff la conversación sigue apareciendo en el filtro "Sin responder"', async () => {
    const data = await conversations([outbound('agent_handoff'), inbound()], '?unanswered=1')
    expect(data).toHaveLength(1)
    expect(data[0].awaiting_reply_since).toBe(INBOUND_AT)
  })

  it.each(['accepted', 'sent', 'delivered', 'read'])('un saliente que salió de verdad (%s) sí cuenta como respuesta', async status => {
    const data = await conversations([outbound(status), inbound()])
    expect(data[0].awaiting_reply_since).toBeNull()
  })

  it.each(['failed', 'skipped'])('un saliente que no llegó al cliente (%s) sigue sin contar como respuesta', async status => {
    const data = await conversations([outbound(status), inbound()])
    expect(data[0].awaiting_reply_since).toBe(INBOUND_AT)
  })

  it('sin ningún saliente, espera desde el entrante', async () => {
    const data = await conversations([inbound()])
    expect(data[0].awaiting_reply_since).toBe(INBOUND_AT)
  })
})

/**
 * El botón "Agente activo / Agente apagado" del hilo lee ESTE campo. Estuvo
 * roto desde que nació: la ruta calculaba el flag y no lo emitía, así que el
 * botón decía "Agente activo" pase lo que pase y, como manda
 * `{activo: agentOff === true}`, tampoco se podía volver a prender.
 */
describe('GET /api/whatsapp/conversations — agent_off', () => {
  beforeEach(() => {
    state.rows = []
    state.aiRows = []
  })

  it('viaja en la respuesta cuando el agente está apagado', async () => {
    state.aiRows = [aiState({ agent_handed_off: true })]
    const data = await conversations([inbound()])
    expect(data[0].agent_off).toBe(true)
  })

  it('el caso que importa: apagado ANTES de que la IA analice nada (ai === null)', async () => {
    // Es el estado real de casi todas las conversaciones hoy: `analysis_enabled`
    // arranca apagado, así que la fila existe SOLO porque alguien tocó el botón.
    state.aiRows = [aiState({ agent_handed_off: true, last_analyzed_at: null })]
    const data = await conversations([inbound()])
    expect(data[0].ai).toBeNull()
    expect(data[0].agent_off).toBe(true)
  })

  it('sin fila de IA el agente cuenta como activo (nunca undefined)', async () => {
    const data = await conversations([inbound()])
    expect(data[0].agent_off).toBe(false)
  })

  it('con fila pero sin apagar, sigue activo', async () => {
    state.aiRows = [aiState({ agent_handed_off: false })]
    const data = await conversations([inbound()])
    expect(data[0].agent_off).toBe(false)
  })

  it('una fila creada SOLO por el botón no se hace pasar por un análisis', async () => {
    // Los defaults NOT NULL de la tabla (intent 'desconocido', score 0) harían
    // que la pantalla dijera "la IA no pudo determinar la intención" y partiera
    // el score de urgencia a la mitad en una conversación que la IA nunca miró.
    state.aiRows = [aiState({ agent_handed_off: true, last_analyzed_at: null })]
    const data = await conversations([inbound()])
    expect(data[0].priority.analyzed).toBe(false)
  })

  it('con análisis de verdad sí emite `ai`, junto con el freno del agente', async () => {
    state.aiRows = [
      aiState({
        agent_handed_off: true,
        last_analyzed_at: '2026-08-03T10:01:00.000Z',
        intent: 'agendar',
        priority_score: 80,
      }),
    ]
    const data = await conversations([inbound()])
    expect(data[0].ai).not.toBeNull()
    expect(data[0].ai?.intent).toBe('agendar')
    expect(data[0].priority.analyzed).toBe(true)
    expect(data[0].agent_off).toBe(true)
  })
})
