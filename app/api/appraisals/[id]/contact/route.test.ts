/**
 * PATCH /api/appraisals/[id]/contact (crm-ficha-y-llamadas, tarea 5.4): un asesor no
 * puede darse acceso a un contacto ajeno vinculándolo a su tasación.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  estado: { role: 'asesor' as string, id: 'asesor-1' },
  canAccessContact: vi.fn(),
  tasacion: { data: { assigned_to: 'asesor-1', user_id: null } as unknown, error: null as unknown },
  updates: [] as unknown[],
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, email: 'x@ejemplo.com', profile: { id: m.estado.id, role: m.estado.role, is_active: true } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.single = () => Promise.resolve(m.tasacion)
      b.update = (cambios: unknown) => {
        m.updates.push(cambios)
        return { eq: () => Promise.resolve({ error: null }) }
      }
      return b
    },
  }),
}))

import { PATCH } from './route'

const patch = (contact_id: unknown) =>
  PATCH(new Request('http://local/api/appraisals/a-1/contact', { method: 'PATCH', body: JSON.stringify({ contact_id }) }) as never, {
    params: Promise.resolve({ id: 'a-1' }),
  })
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

beforeEach(() => {
  vi.clearAllMocks()
  m.updates.length = 0
  como('asesor')
  m.tasacion = { data: { assigned_to: 'asesor-1', user_id: null }, error: null }
  m.canAccessContact.mockResolvedValue(true)
})

describe('PATCH /api/appraisals/[id]/contact', () => {
  it('asesor vincula a su tasación un contacto ajeno → 404 y no se llama al update', async () => {
    m.canAccessContact.mockResolvedValue(false)
    const res = await patch('c-ajeno')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.updates).toEqual([])
  })
  it('asesor vincula un contacto que creó él → 200', async () => {
    expect((await patch('c-mio')).status).toBe(200)
    expect(m.updates).toEqual([{ contact_id: 'c-mio' }])
  })
  it('asesor desvincula → 200 sin consultar el contacto', async () => {
    expect((await patch(null)).status).toBe(200)
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
  it('coordinadora vincula un contacto asignado a un asesor → 200', async () => {
    como('coordinador')
    expect((await patch('c-de-asesor')).status).toBe(200)
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
  it.each(['abogado', 'agent', 'viewer'])('%s → 403 sin tocar nada', async (rol) => {
    como(rol)
    expect((await patch('c-1')).status).toBe(403)
    expect(m.updates).toEqual([])
  })
  it('asesor sobre una tasación que no es suya → 403 sin consultar el contacto', async () => {
    m.tasacion = { data: { assigned_to: 'otro', user_id: 'otro' }, error: null }
    expect((await patch('c-inexistente')).status).toBe(403)
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
  it('quien la creó (user_id) pasa el chequeo de la tasación, y con un contacto que no ve recibe 404', async () => {
    m.tasacion = { data: { assigned_to: 'otro', user_id: 'asesor-1' }, error: null }
    m.canAccessContact.mockResolvedValue(false)
    expect((await patch('c-ajeno')).status).toBe(404)
    expect(m.updates).toEqual([])
  })
})
