/**
 * GET /api/contacts/[id]/tasks — el bloque Tareas de la ficha (crm-ficha-y-llamadas,
 * tarea 7.2; design.md D3 y D4). La lista pasa por `tareasVisiblesEnFicha` y `total`
 * cuenta lo que se lista.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1' },
  canAccessContact: vi.fn(),
  leerProcesosDelContacto: vi.fn(),
  getPendingTasksForContact: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: m.estado.id,
    email: 'x@ejemplo.com',
    profile: { id: m.estado.id, role: m.estado.role, full_name: 'Quien Mira', is_active: true },
  })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/actividades', () => ({ leerProcesosDelContacto: m.leerProcesosDelContacto }))
vi.mock('@/lib/supabase/tasks', () => ({ getPendingTasksForContact: m.getPendingTasksForContact }))

import { GET } from './route'

const get = (id = 'c-1') =>
  GET(new Request(`http://local/api/contacts/${id}/tasks`) as never, { params: Promise.resolve({ id }) })
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

const proceso = (id: string, assigned_to: string | null, stage = 'request', scheduled_date: string | null = null) => ({
  id,
  stage,
  created_at: '2026-11-20T10:00:00Z',
  assigned_to,
  scheduled_date,
  origin: null,
})
const tarea = (id: string, c: Record<string, unknown> = {}) => ({
  id,
  title: id,
  type: 'follow_up',
  channel: 'call',
  assigned_to: 'coord-1',
  assigned_role: 'coordinador',
  assigned_name: 'Cora',
  created_at: '2026-11-20T10:00:00Z',
  deal_id: null,
  contact_id: 'c-1',
  appraisal_id: null,
  source_activity_id: null,
  description: null,
  due_date: '2026-11-27',
  due_time: '09:00:00',
  all_day: false,
  status: 'pending',
  ...c,
})

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador', 'coord-1')
  m.canAccessContact.mockResolvedValue(true)
  m.leerProcesosDelContacto.mockResolvedValue({
    existe: true,
    procesos: [
      proceso('d-suyo', 'asesor-1'),
      proceso('d-otro', 'asesor-2'),
      proceso('d-sin', null),
      proceso('d-agendada', 'asesor-1', 'scheduled', '2026-11-30'),
    ],
  })
  m.getPendingTasksForContact.mockResolvedValue([
    tarea('t-contacto-coord'),
    tarea('t-contacto-asesor', { assigned_to: 'asesor-1', assigned_role: 'asesor' }),
    tarea('t-contacto-otro', { assigned_to: 'asesor-2', assigned_role: 'asesor' }),
    tarea('t-suyo', { deal_id: 'd-suyo', contact_id: null, assigned_to: 'asesor-1' }),
    tarea('t-otro', { deal_id: 'd-otro', contact_id: null, assigned_to: 'asesor-2' }),
    tarea('t-sin', { deal_id: 'd-sin', contact_id: null, assigned_to: 'coord-1' }),
    tarea('t-suya-en-ajeno', { deal_id: 'd-otro', contact_id: null, assigned_to: 'asesor-1' }),
    tarea('t-agendada', { type: 'new_assignment', deal_id: 'd-agendada', contact_id: null, assigned_to: 'asesor-1' }),
  ])
})

const ids = async (res: Response) => ((await res.json()).tareas as { id: string }[]).map((t) => t.id)

describe('GET /api/contacts/[id]/tasks', () => {
  it('lee las pendientes del contacto y de TODOS sus procesos', async () => {
    await get()
    expect(m.getPendingTasksForContact).toHaveBeenCalledWith('c-1', ['d-suyo', 'd-otro', 'd-sin', 'd-agendada'])
  })

  it('a la coordinadora le vienen todas, salvo la de una tasación agendada; total = lo listado', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    const lista = (body.tareas as { id: string }[]).map((t) => t.id)
    expect(lista).not.toContain('t-agendada')
    expect(lista).toHaveLength(7)
    expect(body.total).toBe(7)
  })

  it('al asesor: lo suyo (también la suya en un proceso ajeno), sin lo de otros ni lo de procesos sin asesor', async () => {
    como('asesor', 'asesor-1')
    const res = await get()
    expect(res.status).toBe(200)
    const lista = await ids(res)
    expect(lista.sort()).toEqual(['t-contacto-asesor', 't-suya-en-ajeno', 't-suyo'].sort())
  })

  it('al asesor no se le cuenta lo que no se le lista', async () => {
    como('asesor', 'asesor-1')
    const body = await (await get()).json()
    expect(body.total).toBe(body.tareas.length)
    expect(body.total).toBe(3)
  })

  it('abogado → 403 sin leer nada', async () => {
    como('abogado')
    const res = await get()
    expect(res.status).toBe(403)
    expect(m.getPendingTasksForContact).not.toHaveBeenCalled()
  })

  it('asesor que no ve el contacto → 404', async () => {
    como('asesor')
    m.canAccessContact.mockResolvedValue(false)
    const res = await get()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.getPendingTasksForContact).not.toHaveBeenCalled()
  })

  it('contacto inexistente → 404', async () => {
    m.leerProcesosDelContacto.mockResolvedValue({ existe: false, procesos: [] })
    expect((await get()).status).toBe(404)
  })

  it('falla la lectura → 500 legible', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.getPendingTasksForContact.mockRejectedValue(new Error('x'))
    const res = await get()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Probá de nuevo/)
    err.mockRestore()
  })
})
