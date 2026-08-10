/**
 * `properties.operation_type` no tiene CHECK en Postgres: cualquier texto entra
 * callado. El alta ahora deja elegir la operación, así que la ruta que escribe
 * es el único lugar donde se puede frenar un valor inventado antes de que un
 * alquiler temporario termine publicado como venta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    creadas: [] as unknown[],
    avanzadas: [] as string[],
    fallaElAvance: false,
    listados: [] as unknown[],
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: 'admin' } })),
}))

vi.mock('@/lib/supabase/properties', () => ({
  createProperty: vi.fn(async (input: unknown) => {
    estado.creadas.push(input)
    return 'prop-1'
  }),
  getPropertiesListPage: vi.fn(async (filtros: unknown) => {
    estado.listados.push(filtros)
    return { data: [], total: 0, hasMore: false }
  }),
  checkAndAdvanceProperty: vi.fn(async (id: string) => {
    if (estado.fallaElAvance) throw new Error('la base dijo que no')
    estado.avanzadas.push(id)
    return true
  }),
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

import { GET, POST } from './route'
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

beforeEach(() => { estado.creadas = []; estado.avanzadas = []; estado.fallaElAvance = false; estado.listados = [] })

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

/**
 * Una propiedad creada desde una tasación hereda las fotos: con la regla nueva
 * nace captada. El auto-avance solo corría al CONFIRMAR una subida de fotos, y
 * en ese camino nunca se sube ninguna — la propiedad quedaba trabada para
 * siempre en su estado inicial.
 */
describe('POST /api/properties — auto-avance de captación', () => {
  it('evalúa la captación al crear', async () => {
    const res = await POST(pedido({ ...base, photos: ['https://x/1.jpg'] }))
    expect(res.status).toBe(200)
    expect(estado.avanzadas).toEqual(['prop-1'])
  })

  it('si el avance falla, el alta igual responde 200: la propiedad ya existe', async () => {
    estado.fallaElAvance = true
    const res = await POST(pedido({ ...base, photos: ['https://x/1.jpg'] }))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('prop-1')
  })
})

/**
 * D5: la cohorte «Pend. Fotos» del desplegable NO es un valor de
 * `properties.status` (el badge la CALCULA), así que viaja por su propio
 * parámetro. Mientras viajaba como `status=pending_photos` —un valor que
 * ningún camino de la app escribe— el filtro devolvía siempre vacío.
 */
describe('GET /api/properties — la cohorte derivada', () => {
  function listar(qs: string) {
    return GET(new NextRequest(`http://local/api/properties?${qs}`))
  }
  const ultimo = () => estado.listados[estado.listados.length - 1] as Record<string, unknown>

  it('pasa la cohorte al listado', async () => {
    await listar('cohorte=sin_fotos')
    expect(ultimo().cohorte).toBe('sin_fotos')
  })

  it('una cohorte inventada se ignora en vez de viajar a la consulta', async () => {
    await listar('cohorte=lo-que-sea')
    expect(ultimo().cohorte).toBeUndefined()
  })

  it('sin cohorte, el filtro por status sigue igual', async () => {
    await listar('status=approved')
    expect(ultimo().status).toBe('approved')
    expect(ultimo().cohorte).toBeUndefined()
  })
})
