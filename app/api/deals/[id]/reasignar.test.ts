/**
 * Reasignar el asesor de un proceso.
 *
 * POR QUÉ (2026-09-17): 16 de 16 procesos creados a mano quedaron SIN asesor, y
 * el CRM le muestra a cada asesor solo lo asignado a él. No había ninguna
 * pantalla ni ruta para arreglarlo: el proceso quedaba invisible para siempre.
 * El PUT solo aceptaba notas y fecha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 'user-admin', profile: { id: 'user-admin', role: 'admin' } },
    perfilDestino: null as { id: string; role: string; is_active: boolean } | null,
    actualizaciones: [] as Record<string, unknown>[],
    fallaElUpdate: false,
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => estado.usuario),
  requireRole: vi.fn(async () => estado.usuario),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessDeal: vi.fn(async () => true) }))
vi.mock('@/lib/supabase/deals', () => ({
  getDeal: vi.fn(async () => ({ id: 'deal-1' })),
  updateDealNotes: vi.fn(async () => {}),
  updateDealSchedule: vi.fn(async () => {}),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.update = (valores: Record<string, unknown>) => {
        estado.actualizaciones.push({ tabla, ...valores })
        return { eq: async () => ({ error: estado.fallaElUpdate ? { message: 'no anduvo' } : null }) }
      }
      q.maybeSingle = async () => ({ data: estado.perfilDestino, error: null })
      return q
    },
  }),
}))

import { PUT } from './route'
import { NextRequest } from 'next/server'

function pedido(body: unknown) {
  return new NextRequest('http://local/api/deals/deal-1', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
const params = Promise.resolve({ id: 'deal-1' })

beforeEach(() => {
  estado.usuario = { id: 'user-admin', profile: { id: 'user-admin', role: 'admin' } }
  estado.perfilDestino = { id: 'asesor-9', role: 'asesor', is_active: true }
  estado.actualizaciones = []
  estado.fallaElUpdate = false
})

describe('PUT /api/deals/[id] — asesor', () => {
  it('un admin puede reasignar el proceso a un asesor activo', async () => {
    const res = await PUT(pedido({ assigned_to: 'asesor-9' }), { params })
    expect(res.status).toBe(200)
    expect(estado.actualizaciones).toEqual([expect.objectContaining({ tabla: 'deals', assigned_to: 'asesor-9' })])
  })

  it('un coordinador también (tiene el pipeline completo)', async () => {
    estado.usuario = { id: 'user-coord', profile: { id: 'user-coord', role: 'coordinador' } }
    const res = await PUT(pedido({ assigned_to: 'asesor-9' }), { params })
    expect(res.status).toBe(200)
  })

  it('un asesor NO puede mover procesos entre asesores', async () => {
    estado.usuario = { id: 'user-asesor', profile: { id: 'user-asesor', role: 'asesor' } }
    const res = await PUT(pedido({ assigned_to: 'asesor-9' }), { params })
    expect(res.status).toBe(403)
    expect(estado.actualizaciones).toHaveLength(0)
  })

  it('no se asigna a alguien que no es asesor', async () => {
    estado.perfilDestino = { id: 'abogado-1', role: 'abogado', is_active: true }
    const res = await PUT(pedido({ assigned_to: 'abogado-1' }), { params })
    expect(res.status).toBe(400)
    expect(estado.actualizaciones).toHaveLength(0)
  })

  it('no se asigna a un usuario dado de baja: el proceso volvería a quedar sin dueño', async () => {
    estado.perfilDestino = { id: 'asesor-9', role: 'asesor', is_active: false }
    const res = await PUT(pedido({ assigned_to: 'asesor-9' }), { params })
    expect(res.status).toBe(400)
    expect(estado.actualizaciones).toHaveLength(0)
  })

  it('a un id que no existe tampoco', async () => {
    estado.perfilDestino = null
    const res = await PUT(pedido({ assigned_to: 'fantasma' }), { params })
    expect(res.status).toBe(400)
  })

  it('si la base falla, lo dice: no responde éxito', async () => {
    estado.fallaElUpdate = true
    const res = await PUT(pedido({ assigned_to: 'asesor-9' }), { params })
    expect(res.status).toBe(500)
  })

  it('sigue aceptando solo notas, como antes', async () => {
    const res = await PUT(pedido({ notes: 'llamó el sábado' }), { params })
    expect(res.status).toBe(200)
    expect(estado.actualizaciones).toHaveLength(0)
  })
})
