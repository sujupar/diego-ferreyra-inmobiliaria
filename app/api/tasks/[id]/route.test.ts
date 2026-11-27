/**
 * PUT /api/tasks/[id] — completar o descartar una tarea (revisión 12.1, hallazgo 2).
 * Antes bastaba con tener sesión para completar o descartar la tarea de cualquiera. Ahora
 * reproduce la policy de la base (`tasks_update_assigned_or_ops`): la tarea es de quien pide,
 * o quien pide es de operaciones (`pipeline.view_all`: admin, dueño, coordinador).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ID = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'

const m = vi.hoisted(() => ({
  estado: { role: 'asesor' as string, id: 'asesor-1' },
  leerAsignadoDeTarea: vi.fn(),
  completeTask: vi.fn(),
  dismissTask: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, email: 'x@ejemplo.com', profile: { id: m.estado.id, role: m.estado.role } })),
}))
vi.mock('@/lib/supabase/tasks', () => ({
  leerAsignadoDeTarea: m.leerAsignadoDeTarea,
  completeTask: m.completeTask,
  dismissTask: m.dismissTask,
}))

import { PUT } from './route'

const put = (body: unknown, id = ID) =>
  PUT(new Request(`http://local/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id }),
  })
const como = (role: string, id: string) => {
  m.estado.role = role
  m.estado.id = id
}

beforeEach(() => {
  vi.clearAllMocks()
  como('asesor', 'asesor-1')
  m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: 'asesor-1' })
  m.completeTask.mockResolvedValue(undefined)
  m.dismissTask.mockResolvedValue(undefined)
})

describe('PUT /api/tasks/[id]', () => {
  it('el asesor completa su propia tarea → 200', async () => {
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(200)
    expect(m.completeTask).toHaveBeenCalledWith(ID, 'asesor-1')
  })

  it('el asesor descarta su propia tarea → 200', async () => {
    const res = await put({ action: 'dismiss' })
    expect(res.status).toBe(200)
    expect(m.dismissTask).toHaveBeenCalledWith(ID)
  })

  it('el asesor y la tarea de otra persona → 403 y no se toca', async () => {
    m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: 'coord-1' })
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/otra persona/)
    expect(m.completeTask).not.toHaveBeenCalled()
  })

  it('el asesor y una tarea sin asignar (de rol) → 403', async () => {
    m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: null })
    const res = await put({ action: 'dismiss' })
    expect(res.status).toBe(403)
    expect(m.dismissTask).not.toHaveBeenCalled()
  })

  it.each(['coordinador', 'admin', 'dueno'])('%s completa la tarea de otra persona → 200', async (rol) => {
    como(rol, `${rol}-1`)
    m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: 'asesor-9' })
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(200)
    expect(m.completeTask).toHaveBeenCalledWith(ID, `${rol}-1`)
  })

  it('el abogado completa su tarea de revisión legal → 200; la de otro → 403', async () => {
    como('abogado', 'abogado-1')
    m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: 'abogado-1' })
    expect((await put({ action: 'complete' })).status).toBe(200)
    m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: 'asesor-1' })
    expect((await put({ action: 'complete' })).status).toBe(403)
    expect(m.completeTask).toHaveBeenCalledTimes(1)
  })

  it('rol viejo `agent` y la tarea de otro → 403', async () => {
    como('agent', 'agent-1')
    m.leerAsignadoDeTarea.mockResolvedValue({ assigned_to: 'asesor-1' })
    expect((await put({ action: 'complete' })).status).toBe(403)
  })

  it('tarea que no existe → 404', async () => {
    m.leerAsignadoDeTarea.mockResolvedValue(null)
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(404)
    expect(m.completeTask).not.toHaveBeenCalled()
  })

  it('id que no es uuid → 404 sin consultar la base', async () => {
    const res = await put({ action: 'complete' }, 'no-es-un-id')
    expect(res.status).toBe(404)
    expect(m.leerAsignadoDeTarea).not.toHaveBeenCalled()
  })

  it('acción desconocida → 400 sin tocar nada', async () => {
    const res = await put({ action: 'borrar' })
    expect(res.status).toBe(400)
    expect(m.completeTask).not.toHaveBeenCalled()
    expect(m.dismissTask).not.toHaveBeenCalled()
  })

  it('falla la lectura → 500 sin el detalle', async () => {
    m.leerAsignadoDeTarea.mockRejectedValue(new Error('detalle interno'))
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('detalle interno')
  })
})
