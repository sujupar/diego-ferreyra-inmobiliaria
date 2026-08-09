/**
 * Acá se firma la aprobación o el rechazo legal de una propiedad. La ruta pedía
 * solo `requireAuth()`, así que CUALQUIER usuario autenticado —un asesor
 * aprobando su propia captación— podía hacerlo. La ruta hermana de los
 * documentos sueltos (legal-docs/[itemKey]/review) sí exigía `properties.review`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: { role: 'admin', revisiones: [] as Array<{ id: string; approved: boolean }> },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'u1', profile: { role: estado.role } })),
}))

vi.mock('@/lib/supabase/properties', () => ({
  reviewProperty: vi.fn(async (id: string, approved: boolean) => { estado.revisiones.push({ id, approved }) }),
  getProperty: vi.fn(async () => ({ address: 'Rivadavia 4820', assigned_to: null })),
}))

vi.mock('@/lib/supabase/tasks', () => ({ createTask: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/legal-events', () => ({ logLegalEvent: vi.fn(async () => {}) }))

import { POST } from './route'
import { NextRequest } from 'next/server'
import { ROLES, hasPermission } from '@/lib/auth/roles'

function pedido(body: unknown) {
  return new NextRequest('http://local/api/properties/p1/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = Promise.resolve({ id: 'p1' })

beforeEach(() => { estado.revisiones = []; estado.role = 'admin' })

describe('POST /api/properties/[id]/review — permisos', () => {
  it('un asesor no puede aprobar la revisión legal', async () => {
    estado.role = 'asesor'
    const res = await POST(pedido({ approved: true }), { params })
    expect(res.status).toBe(403)
    expect(estado.revisiones).toHaveLength(0)
  })

  it('un asesor tampoco puede rechazarla', async () => {
    estado.role = 'asesor'
    const res = await POST(pedido({ approved: false, notes: 'nada' }), { params })
    expect(res.status).toBe(403)
    expect(estado.revisiones).toHaveLength(0)
  })

  it('el abogado sí puede', async () => {
    estado.role = 'abogado'
    const res = await POST(pedido({ approved: true }), { params })
    expect(res.status).toBe(200)
    expect(estado.revisiones).toEqual([{ id: 'p1', approved: true }])
  })

  // El permiso, no una lista de roles a mano: si mañana se le da o se le saca
  // `properties.review` a un rol, la ruta lo sigue solo.
  it.each(ROLES)('el rol %s pasa si y solo si tiene properties.review', async role => {
    estado.role = role
    const res = await POST(pedido({ approved: true }), { params })
    expect(res.status).toBe(hasPermission(role, 'properties.review') ? 200 : 403)
  })
})
