/**
 * GET /api/contacts/[id]/activities — la actividad de la ficha (crm-ficha-y-llamadas,
 * tarea 7.2; design.md D4). 50 por página, sin anuladas, con número de intento, autor,
 * tarea agendada sola y qué puede hacer quien mira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1' },
  canAccessContact: vi.fn(),
  existeContacto: vi.fn(),
  listarActividades: vi.fn(),
  llamadasNoAnuladasDelContacto: vi.fn(),
  nombresDePerfiles: vi.fn(),
  tareasCreadasPor: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: m.estado.id,
    email: 'x@ejemplo.com',
    profile: { id: m.estado.id, role: m.estado.role, full_name: 'Quien Mira', is_active: true },
  })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/actividades', () => ({
  existeContacto: m.existeContacto,
  listarActividades: m.listarActividades,
  llamadasNoAnuladasDelContacto: m.llamadasNoAnuladasDelContacto,
  nombresDePerfiles: m.nombresDePerfiles,
  tareasCreadasPor: m.tareasCreadasPor,
}))

import { GET } from './route'
// Next solo deja exportar los métodos desde un route.ts: el tamaño va escrito acá.
const TAMANO_PAGINA = 50

const get = (qs = '', id = '0000000c-0000-4000-8000-000000000001') =>
  GET(new Request(`http://local/api/contacts/${id}/activities${qs}`) as never, { params: Promise.resolve({ id }) })
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

type Fila = Record<string, unknown>
const fila = (id: string, c: Fila = {}): Fila => ({
  id,
  contact_id: '0000000c-0000-4000-8000-000000000001',
  deal_id: 'd-1',
  kind: 'note',
  call_outcome: null,
  body: 'Algo',
  occurred_at: '2026-11-25T12:00:00.000Z',
  callback_at: null,
  created_at: '2026-11-25T12:00:00.000Z',
  updated_at: null,
  created_by: 'asesor-1',
  voided_at: null,
  voided_by: null,
  automatic: false,
  client_token: 'tok',
  ...c,
})

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador', 'coord-1')
  m.canAccessContact.mockResolvedValue(true)
  m.existeContacto.mockResolvedValue(true)
  m.listarActividades.mockResolvedValue([])
  m.llamadasNoAnuladasDelContacto.mockResolvedValue([])
  m.nombresDePerfiles.mockResolvedValue(new Map([['asesor-1', 'Ana Asesora'], ['coord-1', 'Cora']]))
  m.tareasCreadasPor.mockResolvedValue(new Map())
})

describe('GET /api/contacts/[id]/activities — permisos', () => {
  it('abogado → 403 sin leer nada', async () => {
    como('abogado')
    const res = await get()
    expect(res.status).toBe(403)
    expect(m.listarActividades).not.toHaveBeenCalled()
  })
  it('asesor que no ve el contacto → 404 con el texto de siempre', async () => {
    como('asesor')
    m.canAccessContact.mockResolvedValue(false)
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.listarActividades).not.toHaveBeenCalled()
  })
  it('coordinadora sobre un contacto inexistente → 404', async () => {
    m.existeContacto.mockResolvedValue(false)
    expect((await get()).status).toBe(404)
  })
  it('asesor que ve el contacto → 200 (la actividad se ve completa, también la de otros)', async () => {
    como('asesor')
    m.listarActividades.mockResolvedValue([fila('n-coord', { created_by: 'coord-1' })])
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.actividades).toHaveLength(1)
    expect(body.actividades[0]).toMatchObject({ autor: { id: 'coord-1', nombre: 'Cora' }, puede_editar: false, puede_anular: false })
  })
})

describe('GET — filtros y página', () => {
  it('sin filtro → "todo", sin cursor, pide una fila de más para saber si hay más', async () => {
    await get()
    expect(m.listarActividades).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'todo', null, TAMANO_PAGINA + 1)
    expect(TAMANO_PAGINA).toBe(50)
  })
  it.each(['llamadas', 'notas', 'actividad'])('pasa el filtro %s a la lectura', async (filtro) => {
    await get(`?filtro=${filtro}`)
    expect(m.listarActividades).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', filtro, null, 51)
  })
  it('filtro desconocido → 400', async () => {
    const res = await get('?filtro=whatsapp')
    expect(res.status).toBe(400)
    expect(m.listarActividades).not.toHaveBeenCalled()
  })
  it('página 2: el cursor `antes` llega a la lectura normalizado a ISO', async () => {
    await get('?antes=2026-11-20T10:00:00Z')
    expect(m.listarActividades).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'todo', '2026-11-20T10:00:00.000Z', 51)
  })
  it('cursor que no es una fecha → 400', async () => {
    expect((await get('?antes=ayer')).status).toBe(400)
  })
  it('51 filas → devuelve 50 y hay_mas verdadero; 50 → hay_mas falso', async () => {
    m.listarActividades.mockResolvedValue(Array.from({ length: 51 }, (_, i) => fila(`a-${i}`)))
    let body = await (await get()).json()
    expect(body.actividades).toHaveLength(50)
    expect(body.hay_mas).toBe(true)
    m.listarActividades.mockResolvedValue(Array.from({ length: 50 }, (_, i) => fila(`a-${i}`)))
    body = await (await get()).json()
    expect(body.actividades).toHaveLength(50)
    expect(body.hay_mas).toBe(false)
  })
  it('respeta el orden en que llega de la base (más nuevo primero)', async () => {
    m.listarActividades.mockResolvedValue([fila('nuevo'), fila('viejo')])
    const body = await (await get()).json()
    expect(body.actividades.map((a: { id: string }) => a.id)).toEqual(['nuevo', 'viejo'])
  })
})

describe('GET — intento, autor y tarea agendada sola', () => {
  it('el número de intento sale de TODAS las llamadas no anuladas del contacto, no solo de la página', async () => {
    m.llamadasNoAnuladasDelContacto.mockResolvedValue([
      { id: 'l1', deal_id: 'd-1', kind: 'call', call_outcome: 'no_atendio', occurred_at: '2026-11-20T10:00:00Z', created_at: '2026-11-20T10:00:00Z' },
      { id: 'l2', deal_id: 'd-1', kind: 'call', call_outcome: 'no_atendio', occurred_at: '2026-11-21T10:00:00Z', created_at: '2026-11-21T10:00:00Z' },
      { id: 'l3', deal_id: 'd-1', kind: 'call', call_outcome: 'volver_a_llamar', occurred_at: '2026-11-22T10:00:00Z', created_at: '2026-11-22T10:00:00Z' },
    ])
    m.listarActividades.mockResolvedValue([
      fila('l3', { kind: 'call', call_outcome: 'volver_a_llamar', body: null, callback_at: '2026-11-23T19:00:00Z' }),
      fila('w1', { kind: 'whatsapp_sent', body: null }),
    ])
    const body = await (await get()).json()
    expect(body.actividades[0]).toMatchObject({ intento: 3, titulo: 'Llamada 3 · Volver a llamar' })
    expect(body.actividades[1]).toMatchObject({ intento: null, titulo: 'WhatsApp enviado' })
  })
  it('autor borrado → autor null; perfil que no se pudo leer → nombre vacío', async () => {
    m.listarActividades.mockResolvedValue([fila('a', { created_by: null }), fila('b', { created_by: 'fantasma' })])
    const body = await (await get()).json()
    expect(body.actividades[0].autor).toBeNull()
    expect(body.actividades[1].autor).toEqual({ id: 'fantasma', nombre: '' })
    expect(m.nombresDePerfiles).toHaveBeenCalledWith(['fantasma'])
  })
  it('la tarea que creó cada actividad viaja con ella; las demás, null', async () => {
    const tarea = { id: 't-1', title: 'Llamar a Ana', due_date: '2026-11-27', due_time: '09:00:00' }
    m.tareasCreadasPor.mockResolvedValue(new Map([['l1', tarea]]))
    m.listarActividades.mockResolvedValue([fila('l1', { kind: 'call', call_outcome: 'no_atendio', body: null }), fila('n1')])
    const body = await (await get()).json()
    expect(m.tareasCreadasPor).toHaveBeenCalledWith(['l1', 'n1'])
    expect(body.actividades[0].tarea_creada).toEqual(tarea)
    expect(body.actividades[1].tarea_creada).toBeNull()
  })
  it('no devuelve el client_token', async () => {
    m.listarActividades.mockResolvedValue([fila('n1')])
    const body = await (await get()).json()
    expect(body.actividades[0]).not.toHaveProperty('client_token')
  })
  it('puede_editar/puede_anular según quien mira: el autor asesor edita y anula su nota', async () => {
    como('asesor')
    m.listarActividades.mockResolvedValue([fila('n1')])
    const body = await (await get()).json()
    expect(body.actividades[0]).toMatchObject({ puede_editar: true, puede_anular: true })
  })
  it('falla la lectura → 500 con texto legible', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.listarActividades.mockRejectedValue(new Error('x'))
    const res = await get()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Probá de nuevo/)
    err.mockRestore()
  })
})

describe('ids que no son uuid (revisión 12.1)', () => {
  it('→ 404 sin consultar la base', async () => {
    expect((await get('', 'no-es-uuid')).status).toBe(404)
    expect(m.existeContacto).not.toHaveBeenCalled()
    expect(m.listarActividades).not.toHaveBeenCalled()
  })
})
