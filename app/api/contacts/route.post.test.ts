/**
 * POST /api/contacts (crm-ficha-y-llamadas, tarea 5.3): lista cerrada de campos,
 * `created_by` siempre del servidor y `assigned_to` del asesor forzado a él.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UUID = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1' },
  createContact: vi.fn(),
  existePerfil: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, email: 'x@ejemplo.com', profile: { id: m.estado.id, role: m.estado.role, is_active: true } })),
}))
vi.mock('@/lib/supabase/contacts', () => ({
  getContacts: vi.fn(async () => []),
  createContact: m.createContact,
  existePerfil: m.existePerfil,
}))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new Request('http://local/api/contacts', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never)
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}
const insertado = () => m.createContact.mock.calls[0][0]

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador')
  m.createContact.mockResolvedValue('nuevo-1')
  m.existePerfil.mockResolvedValue(true)
})

describe('POST /api/contacts', () => {
  it('el cuerpo exacto que manda ContactEditor → 200 con el id (sigue guardando)', async () => {
    como('asesor')
    const res = await post({ full_name: 'Ana', phone: null, email: null, origin: null, notes: null })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, id: 'nuevo-1' })
    expect(insertado()).toEqual({
      full_name: 'Ana', phone: null, email: null, origin: null, notes: null,
      created_by: 'asesor-1', assigned_to: 'asesor-1',
    })
  })
  it('un asesor que manda assigned_to y created_by de otra persona → quedan los suyos', async () => {
    como('asesor')
    await post({ full_name: 'Ana', assigned_to: UUID, created_by: UUID })
    expect(insertado()).toMatchObject({ created_by: 'asesor-1', assigned_to: 'asesor-1' })
  })
  it('una coordinadora que manda assigned_to de un asesor → se respeta', async () => {
    await post({ full_name: 'Ana', assigned_to: UUID })
    expect(insertado()).toEqual({ full_name: 'Ana', assigned_to: UUID, created_by: 'coordinador-1' })
  })
  it('una coordinadora sin assigned_to → sin asesor, created_by ella', async () => {
    await post({ full_name: 'Ana' })
    expect(insertado()).toEqual({ full_name: 'Ana', created_by: 'coordinador-1' })
  })
  it('una coordinadora con assigned_to de un perfil que no existe → 400 sin insertar', async () => {
    m.existePerfil.mockResolvedValue(false)
    const res = await post({ full_name: 'Ana', assigned_to: UUID })
    expect(res.status).toBe(400)
    expect(m.createContact).not.toHaveBeenCalled()
  })
  it('un campo desconocido no llega al insert', async () => {
    await post({ full_name: 'Ana', foo: 'bar', is_admin: true })
    expect(insertado()).not.toHaveProperty('foo')
    expect(insertado()).not.toHaveProperty('is_admin')
  })
  it('sin nombre → 400', async () => {
    const res = await post({ phone: '11' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'El nombre es obligatorio.' })
  })
  it('un cuerpo que no es JSON → 400', async () => {
    expect((await post('{roto')).status).toBe(400)
  })
  it.each(['abogado', 'agent', 'viewer', 'inventado'])('%s → 403 sin insertar nada', async (rol) => {
    como(rol)
    const res = await post({ full_name: 'Ana' })
    expect(res.status).toBe(403)
    expect(m.createContact).not.toHaveBeenCalled()
  })
  it('un error de la base → 500 sin el detalle', async () => {
    m.createContact.mockRejectedValue(new Error('23514 check'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ full_name: 'Ana' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No se pudo guardar. Probá de nuevo.' })
    err.mockRestore()
  })
})
