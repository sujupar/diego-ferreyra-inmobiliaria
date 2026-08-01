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
  state: { rows: [] as Array<Record<string, unknown>> },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: 'admin' } })),
}))

vi.mock('@supabase/supabase-js', () => {
  // Query builder mínimo y encadenable. Las queries con `{ head: true }` son
  // los conteos de `checkWebhookNotSubscribed`; el resto de las tablas
  // (leads/etiquetas/propiedades/IA) devuelve vacío: acá solo interesa el
  // agrupado de `whatsapp_messages`.
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
      const result = head
        ? { count: 0, error: null }
        : { data: table === 'whatsapp_messages' ? state.rows : [], error: null }
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

/** `allRows` llega ordenado desc por `created_at` (lo garantiza el `.order()` de la query real). */
async function conversations(rows: Array<Record<string, unknown>>, query = '') {
  state.rows = rows
  const res = await GET({ url: `http://localhost/api/whatsapp/conversations${query}` } as unknown as Request)
  const json = (await res.json()) as { data: Array<{ awaiting_reply_since: string | null }> }
  return json.data
}

describe('GET /api/whatsapp/conversations — awaiting_reply_since', () => {
  beforeEach(() => {
    state.rows = []
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
