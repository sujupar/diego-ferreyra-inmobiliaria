/**
 * POST /api/appraisals/[id]/ai-valuation — genera la valuación del Tasador IA.
 *
 * Lo que se fija acá: los dos candados de escritura (el abogado no genera),
 * que sin proveedor de IA no se escribe nada, que al modelo le llegan SOLO los
 * comparables normales, y que un fallo del modelo queda registrado como
 * `failed` con su motivo (nunca `pending` colgado ni datos a medias).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: {
    rol: 'admin' as string,
    filas: {} as Record<string, unknown>,
    escrituras: [] as unknown[],
    correr: vi.fn(),
    configurado: true,
  },
}))

vi.mock('@supabase/supabase-js', () => {
  const armar = (tabla: string) => {
    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = self; b.eq = self; b.order = self; b.lt = self
    b.single = async () => ({
      data: registro.filas[tabla] ?? null,
      error: registro.filas[tabla] ? null : { code: 'PGRST116' },
    })
    b.maybeSingle = b.single
    b.update = (p: unknown) => { registro.escrituras.push(p); return { eq: async () => ({ error: null }) } }
    // Una consulta sin `.single()` (la lista de comparables) se resuelve con `then`.
    b.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: registro.filas[`${tabla}:lista`] ?? [], error: null }).then(ok)
    return b
  }
  return { createClient: () => ({ from: armar }) }
})
vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'yo', email: 'yo@local', profile: { id: 'yo', role: registro.rol } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessAppraisal: vi.fn(async () => true) }))
vi.mock('@/lib/ai/chat-client', () => ({ chatCompletion: vi.fn(), hasAiConfigured: () => registro.configurado }))
vi.mock('@/lib/valuation/tasador-ia', async (orig) => ({
  ...(await orig<typeof import('@/lib/valuation/tasador-ia')>()),
  correrTasadorIA: (...a: unknown[]) => registro.correr(...a),
}))

import { POST } from './route'

const params = Promise.resolve({ id: 't1' })
const pedido = () => new Request('http://local/api/appraisals/t1/ai-valuation', { method: 'POST' }) as never
const comparable = (i: number) => ({
  title: `c${i}`, location: null, url: null, price: 100_000 + i, currency: 'USD', description: null, images: null,
  features: { coveredArea: 50 }, analysis: null, sort_order: i,
})

beforeEach(() => {
  registro.rol = 'admin'
  registro.escrituras.length = 0
  registro.configurado = true
  registro.correr.mockReset()
  registro.filas = {
    appraisals: {
      id: 't1', property_title: 's', property_location: 'l', property_features: { coveredArea: 60 },
      valuation_result: { expenseRates: { saleDiscountPercent: 5 }, ownerSharePercent: 100, purchaseScenarios: [], selectedScenarioIds: [] },
      valuation_source: 'calculator', updated_at: 'u',
    },
    'appraisal_comparables:lista': [
      comparable(0), comparable(1), comparable(2),
      { ...comparable(3), analysis: { propertyType: 'overpriced' }, sort_order: 1000 },
    ],
  }
  registro.correr.mockResolvedValue({
    publicationPrice: 1, saleValue: 1, moneyInHand: 1, currency: 'USD', comparableAnalysis: [],
    ai: { inputFingerprint: 'h', comparables: [] },
  })
})

describe('POST /api/appraisals/[id]/ai-valuation', () => {
  it('el abogado no puede', async () => {
    registro.rol = 'abogado'
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(403)
    expect(registro.escrituras).toHaveLength(0)
  })

  it('sin IA configurada responde 503 sin escribir', async () => {
    registro.configurado = false
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(503)
    expect(registro.escrituras).toHaveLength(0)
  })

  it('marca pending, corre el tasador SOLO con los comparables normales y guarda ready', async () => {
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(200)
    const entrada = registro.correr.mock.calls[0][0] as { comparables: unknown[]; ownerSharePercent: number }
    expect(entrada.comparables).toHaveLength(3)
    expect(entrada.ownerSharePercent).toBe(100)
    expect((registro.escrituras[0] as { ai_valuation_status: string }).ai_valuation_status).toBe('pending')
    expect((registro.escrituras[1] as { ai_valuation_status: string }).ai_valuation_status).toBe('ready')
  })

  it('si el modelo falla, guarda failed con el motivo y responde 422', async () => {
    registro.correr.mockRejectedValue(new Error('Tasador IA: el modelo no devolvió JSON'))
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(422)
    const ultimo = registro.escrituras.at(-1) as { ai_valuation_status: string; ai_valuation_error: string }
    expect(ultimo.ai_valuation_status).toBe('failed')
    expect(ultimo.ai_valuation_error).toMatch(/JSON/)
  })

  it('si el modelo se pasa de tiempo, el motivo lo dice en castellano', async () => {
    const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'
    registro.correr.mockRejectedValue(e)
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(422)
    const ultimo = registro.escrituras.at(-1) as { ai_valuation_error: string }
    expect(ultimo.ai_valuation_error).toMatch(/20 segundos/)
  })

  it('tasación inexistente → 404', async () => {
    registro.filas = {}
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(404)
  })
})
