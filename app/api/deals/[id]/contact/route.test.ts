/**
 * PATCH /api/deals/[id]/contact (crm-ficha-y-llamadas, tarea 5.4): un asesor no puede
 * darse acceso a un contacto ajeno vinculándolo a su proceso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  estado: { role: 'asesor' as string, id: 'asesor-1' },
  canAccessContact: vi.fn(),
  proceso: { data: { assigned_to: 'asesor-1', created_by: null } as unknown, error: null as unknown },
  updates: [] as unknown[],
  updateError: null as unknown,
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
      b.single = () => Promise.resolve(m.proceso)
      b.update = (cambios: unknown) => {
        m.updates.push(cambios)
        return { eq: () => Promise.resolve({ error: m.updateError }) }
      }
      return b
    },
  }),
}))

import { PATCH } from './route'

const patch = (contact_id: unknown) =>
  PATCH(new Request('http://local/api/deals/d-1/contact', { method: 'PATCH', body: JSON.stringify({ contact_id }) }) as never, {
    params: Promise.resolve({ id: 'd-1' }),
  })
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

beforeEach(() => {
  vi.clearAllMocks()
  m.updates.length = 0
  m.updateError = null
  como('asesor')
  m.proceso = { data: { assigned_to: 'asesor-1', created_by: null }, error: null }
  m.canAccessContact.mockResolvedValue(true)
})

describe('PATCH /api/deals/[id]/contact', () => {
  it('asesor vincula a su proceso un contacto ajeno → 404 y no se llama al update', async () => {
    m.canAccessContact.mockResolvedValue(false)
    const res = await patch('c-ajeno')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.updates).toEqual([])
    expect(m.canAccessContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'asesor-1' }), 'c-ajeno')
  })
  it('asesor vincula un contacto que creó él → 200', async () => {
    const res = await patch('c-mio')
    expect(res.status).toBe(200)
    expect(m.updates).toEqual([{ contact_id: 'c-mio' }])
  })
  it('asesor desvincula → 200 sin consultar el contacto', async () => {
    expect((await patch(null)).status).toBe(200)
    expect(m.canAccessContact).not.toHaveBeenCalled()
    expect(m.updates).toEqual([{ contact_id: null }])
  })
  it('coordinadora vincula un contacto asignado a un asesor → 200 sin consultar el contacto', async () => {
    como('coordinador')
    expect((await patch('c-de-asesor')).status).toBe(200)
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
  it.each(['abogado', 'agent', 'viewer'])('%s → 403 sin tocar nada', async (rol) => {
    como(rol)
    expect((await patch('c-1')).status).toBe(403)
    expect(m.updates).toEqual([])
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
  it('asesor sobre un proceso que no es suyo → 403 (gana el 403 del proceso y no se consulta el contacto)', async () => {
    m.proceso = { data: { assigned_to: 'otro', created_by: 'otro' }, error: null }
    m.canAccessContact.mockResolvedValue(false)
    const res = await patch('c-inexistente')
    expect(res.status).toBe(403)
    expect(m.canAccessContact).not.toHaveBeenCalled()
    expect(m.updates).toEqual([])
  })
  it('quien creó el proceso sin tenerlo asignado pasa el chequeo del proceso, y con un contacto que no ve recibe 404', async () => {
    m.proceso = { data: { assigned_to: 'otro', created_by: 'asesor-1' }, error: null }
    m.canAccessContact.mockResolvedValue(false)
    expect((await patch('c-ajeno')).status).toBe(404)
    expect(m.updates).toEqual([])
  })
  it('contact_id que no es texto ni null → 400', async () => {
    expect((await patch(42)).status).toBe(400)
  })
  it('un error del update → 500', async () => {
    m.updateError = { message: 'fk' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await patch('c-mio')).status).toBe(500)
    err.mockRestore()
  })
})
