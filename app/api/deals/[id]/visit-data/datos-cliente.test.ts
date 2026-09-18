/**
 * "Finalizar Visita" en un proceso sin los datos del cliente: lo cargado en la
 * visita se GUARDA (no se pierde nada), pero la etapa no se mueve hasta
 * completar los datos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    datos: { stage: 'scheduled', faltan: [] as string[] } as { stage: string; faltan: string[] } | null,
    guardados: 0,
    completadas: 0,
  },
}))

vi.mock('@/lib/auth/require-role', () => ({ requireAuth: vi.fn(async () => ({ id: 'u', profile: { role: 'admin' } })) }))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessDeal: vi.fn(async () => true) }))
vi.mock('@/lib/deals/datos-cliente', async () => {
  const real = await vi.importActual<typeof import('@/lib/deals/datos-cliente')>('@/lib/deals/datos-cliente')
  return { ...real, leerDatosDelProceso: vi.fn(async () => estado.datos) }
})
vi.mock('@/lib/supabase/visit-data', () => ({
  saveVisitData: vi.fn(async () => { estado.guardados++; return {} }),
  getVisitData: vi.fn(async () => null),
  markVisitCompleted: vi.fn(async () => { estado.completadas++; return true }),
}))

import { PATCH } from './route'
import { NextRequest } from 'next/server'

const params = Promise.resolve({ id: 'deal-1' })
const pedido = (body: unknown) => new NextRequest('http://local/api/deals/deal-1/visit-data', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => { estado.datos = { stage: 'scheduled', faltan: [] }; estado.guardados = 0; estado.completadas = 0 })

describe('PATCH /api/deals/[id]/visit-data — datos del cliente', () => {
  it('con datos completos finaliza como siempre', async () => {
    const res = await PATCH(pedido({ snapshot: {}, complete: true }), { params })
    expect(res.status).toBe(200)
    expect(estado.completadas).toBe(1)
  })

  it('sin teléfono: guarda la visita, NO la finaliza, y dice qué falta', async () => {
    estado.datos = { stage: 'scheduled', faltan: ['telefono'] }
    const res = await PATCH(pedido({ snapshot: { sale: null }, complete: true }), { params })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'DATOS_DEL_CLIENTE', faltan: ['telefono'] })
    expect(estado.guardados).toBe(1)
    expect(estado.completadas).toBe(0)
  })

  it('el autoguardado (sin finalizar) nunca se frena', async () => {
    estado.datos = { stage: 'scheduled', faltan: ['email'] }
    const res = await PATCH(pedido({ snapshot: {} }), { params })
    expect(res.status).toBe(200)
  })

  it('corregir la visita de un proceso que ya avanzó no se frena (no se mueve nada)', async () => {
    estado.datos = { stage: 'captured', faltan: ['email'] }
    const res = await PATCH(pedido({ snapshot: {}, complete: true }), { params })
    expect(res.status).toBe(200)
  })
})
