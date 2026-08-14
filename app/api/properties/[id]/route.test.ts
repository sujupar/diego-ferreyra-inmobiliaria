/**
 * El PUT genérico pisa `properties.status` sin mirar el estado previo. Mientras
 * el circuito legal vivió en esa columna, mandar la documentación al abogado
 * era escribir 'pending_review' — y sobre una propiedad ya captada eso apagaba
 * todo de una: la pestaña Difusión, la landing pública (404 con tráfico pago
 * encima), las consultas entrantes (410) y el agendamiento del recorrido. El
 * aviso, en cambio, seguía vivo en MercadoLibre: el trigger de despublicación
 * solo reacciona a 'sold'/'withdrawn'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: { updates: [] as unknown[] },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'u1', profile: { role: 'admin' } })),
  requireRole: vi.fn(async () => ({ id: 'u1', profile: { role: 'admin' } })),
}))

vi.mock('@/lib/auth/entity-access', () => ({ canAccessProperty: vi.fn(async () => true) }))

vi.mock('@/lib/supabase/properties', () => ({
  getProperty: vi.fn(async () => ({ address: 'Rivadavia 4820', neighborhood: 'Caballito' })),
  updateProperty: vi.fn(async (_id: string, patch: unknown) => { estado.updates.push(patch) }),
}))

import { PUT } from './route'
import { NextRequest } from 'next/server'

function pedido(body: unknown) {
  return new NextRequest('http://local/api/properties/p1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = Promise.resolve({ id: 'p1' })

beforeEach(() => { estado.updates = [] })

describe('PUT /api/properties/[id]', () => {
  it('rechaza pending_review y no escribe nada', async () => {
    const res = await PUT(pedido({ status: 'pending_review' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/legal-submit/)
    expect(estado.updates).toHaveLength(0)
  })

  it('el resto de los cambios de estado siguen funcionando', async () => {
    const res = await PUT(pedido({ status: 'descartada' }), { params })
    expect(res.status).toBe(200)
    expect(estado.updates).toEqual([{ status: 'descartada' }])
  })

  it('una edición común de campos pasa igual que siempre', async () => {
    const res = await PUT(pedido({ title: 'Casa en Villa Devoto' }), { params })
    expect(res.status).toBe(200)
    expect(estado.updates).toEqual([{ title: 'Casa en Villa Devoto' }])
  })

  it('el PRECIO no entra por acá: tiene una sola puerta con freno', async () => {
    // Este PUT manda el body entero al UPDATE sin mirar nada. Dejarlo tocar el
    // precio sería un desvío alrededor del freno de /details, y este número se
    // publica solo en una landing con pauta encima.
    const res = await PUT(pedido({ asking_price: 195000 }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/details/)
    expect(estado.updates).toHaveLength(0)
  })

  it('la moneda tampoco', async () => {
    const res = await PUT(pedido({ currency: 'ARS' }), { params })
    expect(res.status).toBe(400)
    expect(estado.updates).toHaveLength(0)
  })
})
