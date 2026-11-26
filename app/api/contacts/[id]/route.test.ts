/**
 * Permisos de GET y PUT /api/contacts/[id] (crm-ficha-y-llamadas, tarea 5.2).
 * Todo corre con service role: la ruta es la única barrera.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const UUID = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1' },
  canAccessContact: vi.fn(),
  getContact: vi.fn(),
  updateContact: vi.fn(),
  existePerfil: vi.fn(),
  deleteContact: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, email: 'x@ejemplo.com', profile: { id: m.estado.id, role: m.estado.role, is_active: true } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/contacts', () => ({
  getContact: m.getContact,
  updateContact: m.updateContact,
  existePerfil: m.existePerfil,
  deleteContact: m.deleteContact,
}))

import { GET, PUT, DELETE } from './route'

const ctx = (id = '0000000c-0000-4000-8000-000000000001') => ({ params: Promise.resolve({ id }) })
const get = (id?: string) => GET(new Request('http://local/api/contacts/c-1') as never, ctx(id))
const put = (body: unknown, id?: string) =>
  PUT(
    new Request('http://local/api/contacts/c-1', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never,
    ctx(id),
  )
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

const datos = () => ({
  contact: { id: '0000000c-0000-4000-8000-000000000001', full_name: 'Ana' },
  deals: [{ id: 'd-suyo', assigned_to: 'asesor-1' }, { id: 'd-otro', assigned_to: 'asesor-2' }],
  appraisals: [{ id: 'a-suya', assigned_to: null, user_id: 'asesor-1' }, { id: 'a-otra', assigned_to: 'asesor-2', user_id: null }],
  properties: [{ id: 'p-otra', assigned_to: 'asesor-2' }],
  scheduled: [{ id: 's-suya', assigned_to: 'asesor-1' }, { id: 's-otra', assigned_to: 'asesor-2' }],
})

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador')
  m.canAccessContact.mockResolvedValue(true)
  m.getContact.mockResolvedValue(datos())
  m.updateContact.mockResolvedValue(true)
  m.existePerfil.mockResolvedValue(true)
})

describe('GET /api/contacts/[id]', () => {
  it('la coordinadora ve todo, sin consultar canAccessContact', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deals).toHaveLength(2)
    expect(body.scheduled.map((s: { id: string }) => s.id)).toEqual(['s-suya', 's-otra'])
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
  it('al asesor le vuelven solo sus procesos, tasaciones, propiedades y tasaciones agendadas', async () => {
    como('asesor')
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deals.map((d: { id: string }) => d.id)).toEqual(['d-suyo'])
    expect(body.appraisals.map((a: { id: string }) => a.id)).toEqual(['a-suya'])
    expect(body.properties).toEqual([])
    expect(body.scheduled.map((s: { id: string }) => s.id)).toEqual(['s-suya'])
  })
  it('asesor con solo un proceso del contacto (canAccessContact da sí) → 200', async () => {
    como('asesor')
    expect((await get()).status).toBe(200)
    expect(m.canAccessContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'asesor-1' }), '0000000c-0000-4000-8000-000000000001')
  })
  it('asesor ajeno → 404 y no se lee el contacto', async () => {
    como('asesor')
    m.canAccessContact.mockResolvedValue(false)
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.getContact).not.toHaveBeenCalled()
  })
  it('contacto inexistente → 404 (la misma respuesta)', async () => {
    m.getContact.mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
  })
  it.each(['abogado', 'agent', 'viewer', 'inventado'])('%s → 403', async (rol) => {
    como(rol)
    const res = await get()
    expect(res.status).toBe(403)
    expect(m.getContact).not.toHaveBeenCalled()
  })
  it('un error de la base → 500 con mensaje en castellano, sin el detalle', async () => {
    m.getContact.mockRejectedValue(new Error('detalle interno de postgres'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await get()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No se pudo cargar el contacto. Probá de nuevo.' })
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('PUT /api/contacts/[id]', () => {
  it('{ notes } solo → 200 y se guarda solo notes', async () => {
    const res = await put({ notes: 'Background' })
    expect(res.status).toBe(200)
    expect(m.updateContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', { notes: 'Background' })
  })
  it('cuerpo vacío → 400', async () => {
    expect((await put({})).status).toBe(400)
    expect(m.updateContact).not.toHaveBeenCalled()
  })
  it('solo campos desconocidos → 400', async () => {
    expect((await put({ foo: 'bar' })).status).toBe(400)
  })
  it('un cuerpo que no es JSON → 400', async () => {
    expect((await put('{no es json')).status).toBe(400)
  })
  it('full_name vacío → 400', async () => {
    const res = await put({ full_name: '' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'El nombre no puede quedar vacío.' })
  })
  it('asesor dueño manda assigned_to junto con otro campo → 200 y assigned_to/created_by no cambian', async () => {
    como('asesor')
    const res = await put({ notes: 'x', assigned_to: 'asesor-1', created_by: 'otro' })
    expect(res.status).toBe(200)
    expect(m.updateContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', { notes: 'x' })
  })
  it('asesor que intenta reasignarse mandando solo assigned_to → 400', async () => {
    como('asesor')
    expect((await put({ assigned_to: UUID })).status).toBe(400)
    expect(m.updateContact).not.toHaveBeenCalled()
  })
  it('asesor con solo un proceso del contacto → 200', async () => {
    como('asesor')
    expect((await put({ notes: 'x' })).status).toBe(200)
  })
  it('asesor con solo una tasación del contacto → 200', async () => {
    como('asesor')
    m.canAccessContact.mockResolvedValue(true)
    expect((await put({ phone: '11' })).status).toBe(200)
  })
  it('asesor ajeno → 404 y no se actualiza', async () => {
    como('asesor')
    m.canAccessContact.mockResolvedValue(false)
    expect((await put({ notes: 'x' })).status).toBe(404)
    expect(m.updateContact).not.toHaveBeenCalled()
  })
  it.each(['abogado', 'agent', 'viewer'])('%s → 403', async (rol) => {
    como(rol)
    expect((await put({ notes: 'x' })).status).toBe(403)
    expect(m.updateContact).not.toHaveBeenCalled()
  })
  it('el cuerpo exacto de ContactEditor con nulls → 200 y se guardan como null', async () => {
    const res = await put({ full_name: 'Ana', phone: null, email: null, origin: null, notes: null })
    expect(res.status).toBe(200)
    expect(m.updateContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', { full_name: 'Ana', phone: null, email: null, origin: null, notes: null })
  })
  it('el mismo cuerpo con textos vacíos → 200 y se guardan como null', async () => {
    await put({ full_name: 'Ana', phone: '', email: '', origin: '', notes: '' })
    expect(m.updateContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', { full_name: 'Ana', phone: null, email: null, origin: null, notes: null })
  })
  it('email viejo mal formado y se cambia solo el teléfono (cuerpo completo de ContactEditor) → 200', async () => {
    const res = await put({ full_name: 'Ana', phone: '11 2222 3333', email: 'ana@@mal', origin: 'referido', notes: null })
    expect(res.status).toBe(200)
  })
  it('origin fuera de la lista → 400', async () => {
    const res = await put({ origin: 'tasacion' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Origen no válido.' })
  })
  it('coordinadora con assigned_to que no es un id → 400', async () => {
    const res = await put({ assigned_to: 'Lucas' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Ese usuario no existe.' })
  })
  it('coordinadora con assigned_to de un id que no existe → 400', async () => {
    m.existePerfil.mockResolvedValue(false)
    const res = await put({ assigned_to: UUID })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Ese usuario no existe.' })
    expect(m.updateContact).not.toHaveBeenCalled()
  })
  it('coordinadora con assigned_to vacío → 200 sin asesor', async () => {
    expect((await put({ assigned_to: '' })).status).toBe(200)
    expect(m.updateContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', { assigned_to: null })
    expect(m.existePerfil).not.toHaveBeenCalled()
  })
  it('coordinadora reasigna a un perfil que existe → 200', async () => {
    expect((await put({ assigned_to: UUID })).status).toBe(200)
    expect(m.updateContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', { assigned_to: UUID })
  })
  it('contacto inexistente (no se actualizó ninguna fila) → 404', async () => {
    m.updateContact.mockResolvedValue(false)
    expect((await put({ notes: 'x' })).status).toBe(404)
  })
  it('un error de la base → 500 sin el detalle', async () => {
    m.updateContact.mockRejectedValue(new Error('duplicate key'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await put({ notes: 'x' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No se pudo guardar. Probá de nuevo.' })
    err.mockRestore()
  })
})

describe('DELETE /api/contacts/[id] (tarea 5.3)', () => {
  const borrar = () => DELETE(new Request('http://local/api/contacts/c-1', { method: 'DELETE' }) as never, ctx())
  it.each(['coordinador', 'asesor', 'abogado', 'agent'])('%s → 403 en JSON y no se borra', async (rol) => {
    como(rol)
    const res = await borrar()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Solo un administrador o el dueño pueden borrar contactos.' })
    expect(m.deleteContact).not.toHaveBeenCalled()
  })
  it.each(['admin', 'dueno'])('%s → borra como hoy', async (rol) => {
    como(rol)
    m.deleteContact.mockResolvedValue(true)
    const res = await borrar()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(m.deleteContact).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001')
  })
  it('admin sobre un contacto inexistente → 404', async () => {
    como('admin')
    m.deleteContact.mockResolvedValue(false)
    expect((await borrar()).status).toBe(404)
  })
  it('un error de la base → 500 sin el detalle', async () => {
    como('admin')
    m.deleteContact.mockRejectedValue(new Error('fk'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await borrar()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No se pudo borrar el contacto. Probá de nuevo.' })
    err.mockRestore()
  })
})

describe('ids que no son uuid (revisión 12.1)', () => {
  it('GET, PUT y DELETE con un id que no es uuid → 404 sin consultar la base (antes era un 500)', async () => {
    expect((await get('no-es-uuid')).status).toBe(404)
    expect((await put({ full_name: 'Ana' }, 'no-es-uuid')).status).toBe(404)
    como('admin')
    const borrar = await DELETE(new Request('http://local/api/contacts/x', { method: 'DELETE' }) as never, ctx('no-es-uuid'))
    expect(borrar.status).toBe(404)
    expect(m.getContact).not.toHaveBeenCalled()
    expect(m.updateContact).not.toHaveBeenCalled()
    expect(m.deleteContact).not.toHaveBeenCalled()
  })
  it('el asesor recibe el mismo 404, sin consultar permisos', async () => {
    como('asesor')
    expect((await get('1 OR 1=1')).status).toBe(404)
    expect(m.canAccessContact).not.toHaveBeenCalled()
  })
})
