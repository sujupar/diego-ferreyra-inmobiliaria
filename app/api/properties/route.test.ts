/**
 * `properties.operation_type` no tiene CHECK en Postgres: cualquier texto entra
 * callado. El alta ahora deja elegir la operación, así que la ruta que escribe
 * es el único lugar donde se puede frenar un valor inventado antes de que un
 * alquiler temporario termine publicado como venta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: { creadas: [] as unknown[] },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: 'admin' } })),
}))

vi.mock('@/lib/supabase/properties', () => ({
  createProperty: vi.fn(async (input: unknown) => {
    estado.creadas.push(input)
    return 'prop-1'
  }),
  getPropertiesListPage: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
}))

vi.mock('@/lib/properties/geocode-on-write', () => ({
  geocodePropertyBestEffort: vi.fn(async () => {}),
}))

vi.mock('@/lib/email/notifications/property-created', () => ({
  notifyPropertyCreated: vi.fn(async () => {}),
}))

vi.mock('@/lib/email/notify-with-escalation', () => ({
  notifyWithEscalation: vi.fn(async () => {}),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

function pedido(body: unknown): NextRequest {
  return new NextRequest('http://local/api/properties', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const base = {
  address: 'Junín 1200', neighborhood: 'Recoleta', asking_price: 250000,
  assigned_to: '00000000-0000-0000-0000-000000000009',
}

beforeEach(() => { estado.creadas = [] })

describe('POST /api/properties — operación', () => {
  it.each(['venta', 'alquiler', 'temporario'])('acepta "%s" y la guarda', async op => {
    const res = await POST(pedido({ ...base, operation_type: op }))
    expect(res.status).toBe(200)
    expect((estado.creadas[0] as { operation_type: string }).operation_type).toBe(op)
  })

  it('rechaza una operación inventada — la base la aceptaría callada', async () => {
    const res = await POST(pedido({ ...base, operation_type: 'alquiler_temporario' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Operación inválida/)
    expect(estado.creadas).toHaveLength(0)
  })

  it('sin operación sigue funcionando como siempre (default de la base)', async () => {
    const res = await POST(pedido(base))
    expect(res.status).toBe(200)
    expect((estado.creadas[0] as { operation_type?: string }).operation_type).toBeUndefined()
  })
})
