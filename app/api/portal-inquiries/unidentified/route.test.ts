/**
 * Tests de `GET /api/portal-inquiries/unidentified` — la cola de "Avisos por
 * identificar".
 *
 * El bug que motivó estos tests: la cola filtraba `property_id IS NULL`, pero
 * identificar un aviso cuya propiedad NO está cargada en el CRM deja
 * `property_id` en null a propósito. O sea que la cola nunca se vaciaba justo
 * en el caso para el que se hizo la pantalla, y encima crecía: cada consulta
 * nueva del mismo aviso volvía a entrar sin `property_id`.
 *
 * Lo que se moquea es solo el mundo real (auth y Supabase). El agrupado corre
 * de verdad (`lib/portals/unidentified.ts`, con sus propios tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    role: 'coordinador',
    rows: [] as Array<Record<string, unknown>>,
    error: null as { message: string } | null,
    /** Se registra cada filtro aplicado, para poder afirmar CUÁL es el criterio. */
    filtros: [] as string[],
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: state.role } })),
}))

vi.mock('@supabase/supabase-js', () => {
  function builder() {
    const q: Record<string, unknown> & { then?: unknown } = {}
    const self = () => q
    q.select = self
    q.order = self
    q.limit = self
    q.eq = (col: string, val: unknown) => {
      state.filtros.push(`eq:${col}=${String(val)}`)
      return q
    }
    q.is = (col: string, val: unknown) => {
      state.filtros.push(`is:${col}=${String(val)}`)
      return q
    }
    q.or = (expr: string) => {
      state.filtros.push(`or:${expr}`)
      return q
    }
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.error ? null : state.rows, error: state.error }).then(resolve, reject)
    return q
  }
  return { createClient: () => ({ from: () => builder() }) }
})

import { GET } from './route'

const CODIGO = '2DLPOM'

/** Consulta de portal ya identificada a mano: tiene asesor, pero NO ficha en el CRM. */
function consulta(over: Record<string, unknown> = {}) {
  return {
    portal: 'zonaprop',
    property_external_code: CODIGO,
    raw_subject: '📩 ¡Recibiste una nueva consulta por el aviso Depto 2 Amb! CÓD:2DLPOM - REF:#1#',
    lead_name: 'Marcelo',
    created_at: '2026-08-06T12:00:00Z',
    received_at: '2026-08-06T11:59:00Z',
    ...over,
  }
}

async function pedir() {
  const res = await GET()
  return { status: res.status, body: (await res.json()) as { data?: unknown[]; error?: string } }
}

describe('GET /api/portal-inquiries/unidentified', () => {
  beforeEach(() => {
    state.role = 'coordinador'
    state.rows = []
    state.error = null
    state.filtros = []
  })

  it('pregunta por quién la atiende, NO por si hay ficha en el CRM', async () => {
    await pedir()
    // El criterio tiene que cubrir "sin asesor" — que es lo único que
    // `POST /identify` garantiza escribir siempre.
    expect(state.filtros.join(' | ')).toContain('assigned_to')
    // Y NO puede volver a colgarse de `property_id`: identificar sin ficha lo
    // deja en null a propósito, así que el aviso no saldría nunca de la cola.
    expect(state.filtros.join(' | ')).not.toContain('property_id')
  })

  it('devuelve el aviso agrupado con su conteo', async () => {
    state.rows = [consulta(), consulta({ created_at: '2026-08-05T09:00:00Z', lead_name: 'Ana' })]
    const { status, body } = await pedir()
    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data?.[0]).toMatchObject({ externalCode: CODIGO, inquiryCount: 2 })
  })

  it('un rol no autorizado recibe 403, no una lista vacía', async () => {
    state.role = 'asesor'
    const { status, body } = await pedir()
    expect(status).toBe(403)
    expect(body.error).toBe('forbidden')
  })

  it('un fallo de la consulta responde 500 con el motivo, nunca 200 con la cola vacía', async () => {
    state.error = { message: 'timeout' }
    const { status, body } = await pedir()
    expect(status).toBe(500)
    expect(body.error).toBe('timeout')
    expect(body.data).toBeUndefined()
  })
})
