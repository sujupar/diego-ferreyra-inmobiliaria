/**
 * El freno del precio también vive en el SERVIDOR.
 *
 * La confirmación de la tarjeta corre en el navegador: un bug, una pestaña con
 * código viejo o un llamado directo a la API la saltean. Como este número se
 * publica solo en una landing con pauta encima, un cambio brusco necesita venir
 * marcado como confirmado o la ruta lo rechaza.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    role: 'coordinador',
    acceso: true,
    propiedad: { id: 'p1', asking_price: 1_350_000, currency: 'USD' } as Record<string, unknown> | null,
    actualizaciones: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'u1', profile: { role: estado.role } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({
  canAccessProperty: vi.fn(async () => estado.acceso),
}))
vi.mock('@/lib/supabase/properties', () => ({
  getProperty: vi.fn(async () => estado.propiedad),
  updateProperty: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    estado.actualizaciones.push(patch)
  }),
}))

import { PATCH } from './route'

function pedido(body: unknown) {
  return new Request('http://x/api/properties/p1/details', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}
const params = Promise.resolve({ id: 'p1' })

beforeEach(() => {
  estado.role = 'coordinador'
  estado.acceso = true
  estado.propiedad = { id: 'p1', asking_price: 1_350_000, currency: 'USD' }
  estado.actualizaciones = []
})

describe('PATCH /details — freno del precio en el servidor', () => {
  it('RECHAZA un precio a medio tipear que llegue sin confirmar', async () => {
    const res = await PATCH(pedido({ asking_price: 12 }), { params })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.requiereConfirmacion).toBe(true)
    expect(body.error).toMatch(/1\.350\.000/)
    expect(estado.actualizaciones).toEqual([])
  })

  it('lo ACEPTA cuando viene confirmado explícitamente', async () => {
    const res = await PATCH(pedido({ asking_price: 12, confirmar: true }), { params })
    expect(res.status).toBe(200)
    expect(estado.actualizaciones).toEqual([{ asking_price: 12 }])
  })

  it('el flag de confirmación NO se guarda como columna', async () => {
    await PATCH(pedido({ asking_price: 900_000, confirmar: true }), { params })
    expect(estado.actualizaciones[0]).not.toHaveProperty('confirmar')
  })

  it('una baja de precio normal pasa sin confirmar', async () => {
    const res = await PATCH(pedido({ asking_price: 1_290_000 }), { params })
    expect(res.status).toBe(200)
    expect(estado.actualizaciones).toEqual([{ asking_price: 1_290_000 }])
  })

  it('cambiar la moneda sin confirmar se rechaza', async () => {
    const res = await PATCH(pedido({ currency: 'ARS' }), { params })
    expect(res.status).toBe(409)
    expect(estado.actualizaciones).toEqual([])
  })

  it('editar solo características no pasa por el freno del precio', async () => {
    const res = await PATCH(pedido({ rooms: 5 }), { params })
    expect(res.status).toBe(200)
    expect(estado.actualizaciones).toEqual([{ rooms: 5 }])
  })

  it('si no se puede leer el precio anterior, NO se adivina: se pide confirmación', async () => {
    estado.propiedad = null
    const res = await PATCH(pedido({ asking_price: 900_000 }), { params })
    expect(res.status).toBe(409)
    expect(estado.actualizaciones).toEqual([])
  })
})

describe('PATCH /details — permisos y validación', () => {
  it('el abogado no edita nada', async () => {
    estado.role = 'abogado'
    const res = await PATCH(pedido({ asking_price: 1_290_000 }), { params })
    expect(res.status).toBe(403)
    expect(estado.actualizaciones).toEqual([])
  })

  it('un asesor sobre una propiedad ajena recibe 403', async () => {
    estado.acceso = false
    const res = await PATCH(pedido({ asking_price: 1_290_000 }), { params })
    expect(res.status).toBe(403)
    expect(estado.actualizaciones).toEqual([])
  })

  it('un precio inválido es 400, no 409: no hay nada que confirmar', async () => {
    const res = await PATCH(pedido({ asking_price: 0 }), { params })
    expect(res.status).toBe(400)
    expect(estado.actualizaciones).toEqual([])
  })

  it('los campos fuera de la lista blanca no llegan al UPDATE', async () => {
    const res = await PATCH(pedido({ rooms: 4, legal_status: 'approved', assigned_to: 'otro' }), { params })
    expect(res.status).toBe(200)
    expect(estado.actualizaciones).toEqual([{ rooms: 4 }])
  })
})
