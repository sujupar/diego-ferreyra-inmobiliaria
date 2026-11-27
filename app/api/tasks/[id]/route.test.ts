/**
 * PUT /api/tasks/[id] — completar o descartar una tarea (revisión 12.1, hallazgo 2).
 * Antes bastaba con tener sesión para completar o descartar la tarea de cualquiera. Ahora
 * reproduce la policy de la base (`tasks_update_assigned_or_ops`): la tarea es de quien pide,
 * o quien pide es de operaciones (`pipeline.view_all`: admin, dueño, coordinador).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ID = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'

const m = vi.hoisted(() => ({
  estado: { role: 'asesor' as string, id: 'asesor-1' },
  leerTareaParaCambio: vi.fn(),
  completeTask: vi.fn(),
  dismissTask: vi.fn(),
  reabrirTarea: vi.fn(),
  posponerTarea: vi.fn(),
  completarCopiasDeEntrada: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, email: 'x@ejemplo.com', profile: { id: m.estado.id, role: m.estado.role } })),
}))
vi.mock('@/lib/supabase/tasks', () => ({
  leerTareaParaCambio: m.leerTareaParaCambio,
  reabrirTarea: m.reabrirTarea,
  posponerTarea: m.posponerTarea,
  completarCopiasDeEntrada: m.completarCopiasDeEntrada,
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
  m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'asesor-1' })
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
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'coord-1' })
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/otra persona/)
    expect(m.completeTask).not.toHaveBeenCalled()
  })

  it('el asesor y una tarea sin asignar (de rol) → 403', async () => {
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: null })
    const res = await put({ action: 'dismiss' })
    expect(res.status).toBe(403)
    expect(m.dismissTask).not.toHaveBeenCalled()
  })

  it.each(['coordinador', 'admin', 'dueno'])('%s completa la tarea de otra persona → 200', async (rol) => {
    como(rol, `${rol}-1`)
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'asesor-9' })
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(200)
    expect(m.completeTask).toHaveBeenCalledWith(ID, `${rol}-1`)
  })

  it('el abogado completa su tarea de revisión legal → 200; la de otro → 403', async () => {
    como('abogado', 'abogado-1')
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'abogado-1' })
    expect((await put({ action: 'complete' })).status).toBe(200)
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'asesor-1' })
    expect((await put({ action: 'complete' })).status).toBe(403)
    expect(m.completeTask).toHaveBeenCalledTimes(1)
  })

  it('rol viejo `agent` y la tarea de otro → 403', async () => {
    como('agent', 'agent-1')
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'asesor-1' })
    expect((await put({ action: 'complete' })).status).toBe(403)
  })

  it('tarea que no existe → 404', async () => {
    m.leerTareaParaCambio.mockResolvedValue(null)
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(404)
    expect(m.completeTask).not.toHaveBeenCalled()
  })

  it('id que no es uuid → 404 sin consultar la base', async () => {
    const res = await put({ action: 'complete' }, 'no-es-un-id')
    expect(res.status).toBe(404)
    expect(m.leerTareaParaCambio).not.toHaveBeenCalled()
  })

  it('acción desconocida → 400 sin tocar nada', async () => {
    const res = await put({ action: 'borrar' })
    expect(res.status).toBe(400)
    expect(m.completeTask).not.toHaveBeenCalled()
    expect(m.dismissTask).not.toHaveBeenCalled()
  })

  it('falla la lectura → 500 sin el detalle', async () => {
    m.leerTareaParaCambio.mockRejectedValue(new Error('detalle interno'))
    const res = await put({ action: 'complete' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('detalle interno')
  })
})

describe('PUT /api/tasks/[id] — reabrir y posponer (crm-tareas-y-campanita)', () => {
  const ar = (f: string, h: string) => new Date(`${f}T${h}:00-03:00`)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ar('2026-11-24', '10:42'))
    m.reabrirTarea.mockResolvedValue('ok')
    m.posponerTarea.mockResolvedValue(true)
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'asesor-1', status: 'pending', due_date: '2026-11-20', due_time: null, all_day: true })
  })
  afterEach(() => vi.useRealTimers())

  it('reabrir la propia → 200', async () => {
    expect((await put({ action: 'reopen' })).status).toBe(200)
    expect(m.reabrirTarea).toHaveBeenCalledWith(ID)
  })
  it('reabrir una que no estaba completada o con otra igual pendiente → 409', async () => {
    m.reabrirTarea.mockResolvedValueOnce('no_estaba_completada').mockResolvedValueOnce('conflicto')
    expect((await put({ action: 'reopen' })).status).toBe(409)
    const r = await put({ action: 'reopen' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('Ya hay otra tarea igual pendiente.')
  })
  it('reabrir o posponer una ajena siendo asesor → 403', async () => {
    m.leerTareaParaCambio.mockResolvedValue({ assigned_to: 'asesor-9', status: 'completed', due_date: null, due_time: null, all_day: true })
    expect((await put({ action: 'reopen' })).status).toBe(403)
    expect((await put({ action: 'posponer', due_date: '2026-11-25', due_time: '09:00' })).status).toBe(403)
    expect(m.reabrirTarea).not.toHaveBeenCalled()
    expect(m.posponerTarea).not.toHaveBeenCalled()
  })
  it('posponer: guarda y devuelve la fecha anterior para el "Deshacer"', async () => {
    const r = await put({ action: 'posponer', due_date: '2026-11-24', due_time: '11:45' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ success: true, anterior: { due_date: '2026-11-20', due_time: null } })
    expect(m.posponerTarea).toHaveBeenCalledWith(ID, '2026-11-24', '11:45', undefined)
  })
  it('posponer a un momento pasado o mal escrito → 400', async () => {
    const r = await put({ action: 'posponer', due_date: '2026-11-24', due_time: '10:00' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('Elegí un día y una hora que todavía no hayan pasado.')
    expect((await put({ action: 'posponer', due_date: 'mañana', due_time: '10:00' })).status).toBe(400)
    expect((await put({ action: 'posponer', due_date: '2026-11-25' })).status).toBe(400)
    expect(m.posponerTarea).not.toHaveBeenCalled()
  })
  it('el "Deshacer" vuelve a una fecha vencida o a sin fecha', async () => {
    expect((await put({ action: 'posponer', deshacer: true, due_date: '2026-11-20', due_time: null, desde_fecha: '2026-11-24', desde_hora: '11:45' })).status).toBe(200)
    expect(m.posponerTarea).toHaveBeenLastCalledWith(ID, '2026-11-20', null, { fecha: '2026-11-24', hora: '11:45:00' })
    expect((await put({ action: 'posponer', deshacer: true, due_date: null, due_time: null, desde_fecha: '2026-11-25', desde_hora: '09:00' })).status).toBe(200)
    expect(m.posponerTarea).toHaveBeenLastCalledWith(ID, null, null, { fecha: '2026-11-25', hora: '09:00:00' })
  })
  it('el "Deshacer" no pisa un cambio posterior → 409', async () => {
    m.posponerTarea.mockResolvedValue(false)
    const r = await put({ action: 'posponer', deshacer: true, due_date: null, due_time: null, desde_fecha: '2026-11-25', desde_hora: '09:00' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('Esa tarea cambió mientras tanto: no se pudo deshacer.')
  })
  it('completar cierra también la copia de la otra coordinadora (si falla, igual 200)', async () => {
    m.completeTask.mockResolvedValue(true)
    m.completarCopiasDeEntrada.mockResolvedValue(1)
    expect((await put({ action: 'complete' })).status).toBe(200)
    expect(m.completarCopiasDeEntrada).toHaveBeenCalledWith(ID, 'asesor-1')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.completarCopiasDeEntrada.mockRejectedValue(new Error('x'))
    expect((await put({ action: 'complete' })).status).toBe(200)
    err.mockRestore()
  })
  it('si la tarea ya no estaba pendiente (doble clic), no toca las copias', async () => {
    m.completeTask.mockResolvedValue(false)
    expect((await put({ action: 'complete' })).status).toBe(200)
    expect(m.completarCopiasDeEntrada).not.toHaveBeenCalled()
  })
  it('el "Deshacer" con una hora imposible → 400, nunca 500', async () => {
    expect((await put({ action: 'posponer', deshacer: true, due_date: '2026-11-20', due_time: '10:75' })).status).toBe(400)
    expect((await put({ action: 'posponer', deshacer: true, due_date: null, due_time: null, desde_fecha: 'ayer', desde_hora: '09:00' })).status).toBe(400)
    expect((await put({ action: 'posponer', deshacer: true, due_date: null, due_time: null, desde_fecha: '2026-11-20', desde_hora: '9' })).status).toBe(400)
    expect(m.posponerTarea).not.toHaveBeenCalled()
  })
  it('posponer una que ya no está pendiente → 409', async () => {
    m.posponerTarea.mockResolvedValue(false)
    expect((await put({ action: 'posponer', due_date: '2026-11-25', due_time: '09:00' })).status).toBe(409)
  })
})
