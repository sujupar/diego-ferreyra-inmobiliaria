/**
 * PATCH /api/contacts/[id]/activities/[activityId] — editar una nota o anular un
 * registro (crm-ficha-y-llamadas, tarea 6.5; design.md D4 y D8).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  estado: { role: 'asesor' as string, id: 'asesor-1', nombre: 'Ana Asesora' },
  canAccessContact: vi.fn(),
  leerActividadDelContacto: vi.fn(),
  editarNota: vi.fn(),
  anularActividad: vi.fn(),
  intentosNoAnulados: vi.fn(),
  undoTasksOfActivity: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: m.estado.id,
    email: 'x@ejemplo.com',
    profile: { id: m.estado.id, role: m.estado.role, full_name: m.estado.nombre, is_active: true },
  })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/actividades', () => ({
  leerActividadDelContacto: m.leerActividadDelContacto,
  editarNota: m.editarNota,
  anularActividad: m.anularActividad,
  intentosNoAnulados: m.intentosNoAnulados,
}))
vi.mock('@/lib/supabase/tasks', () => ({ undoTasksOfActivity: m.undoTasksOfActivity }))

import { PATCH } from './route'

const ctx = (id = '0000000c-0000-4000-8000-000000000001', activityId = 'aaaaaaaa-0000-4000-8000-000000000001') => ({ params: Promise.resolve({ id, activityId }) })
const patch = (body: unknown, id?: string, activityId?: string) =>
  PATCH(
    new Request('http://local/api/contacts/c-1/activities/act-1', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    ctx(id, activityId),
  )
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

type Fila = Record<string, unknown>
const nota = (c: Fila = {}): Fila => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  contact_id: '0000000c-0000-4000-8000-000000000001',
  deal_id: 'd-1',
  kind: 'note',
  call_outcome: null,
  body: 'Texto original',
  occurred_at: '2026-11-25T12:00:00.000Z',
  callback_at: null,
  created_at: '2026-11-25T12:00:00.000Z',
  updated_at: null,
  created_by: 'asesor-1',
  voided_at: null,
  voided_by: null,
  automatic: false,
  client_token: null,
  ...c,
})
const llamada = (c: Fila = {}): Fila =>
  nota({ kind: 'call', call_outcome: 'no_atendio', body: null, ...c })
const intento = (id: string, occurred_at: string, kind = 'call') => ({
  id,
  deal_id: 'd-1',
  kind,
  call_outcome: kind === 'call' ? 'no_atendio' : null,
  occurred_at,
  created_at: occurred_at,
})

beforeEach(() => {
  vi.clearAllMocks()
  como('asesor', 'asesor-1')
  m.canAccessContact.mockResolvedValue(true)
  m.leerActividadDelContacto.mockResolvedValue(nota())
  m.editarNota.mockImplementation(async (_c: string, _a: string, body: string) =>
    nota({ body, updated_at: '2026-11-26T10:00:00.000Z' }),
  )
  m.anularActividad.mockResolvedValue(undefined)
  m.intentosNoAnulados.mockResolvedValue([])
  m.undoTasksOfActivity.mockResolvedValue({ descartadas: 1, reabiertas: 2 })
})

describe('permisos y pertenencia', () => {
  it('abogado → 403, sin leer nada', async () => {
    como('abogado')
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(403)
    expect(m.leerActividadDelContacto).not.toHaveBeenCalled()
  })
  it('asesor que no ve el contacto → 404', async () => {
    m.canAccessContact.mockResolvedValue(false)
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(404)
    expect(m.anularActividad).not.toHaveBeenCalled()
  })
  it('registro de otro contacto (la lectura filtra por contacto y no lo encuentra) → 404', async () => {
    m.leerActividadDelContacto.mockResolvedValue(null)
    const res = await patch({ accion: 'anular' }, '0000000c-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000ff')
    expect(res.status).toBe(404)
    expect(m.leerActividadDelContacto).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000ff')
    expect(m.anularActividad).not.toHaveBeenCalled()
    expect(m.editarNota).not.toHaveBeenCalled()
  })
  it('acción desconocida o cuerpo sin acción → 400', async () => {
    expect((await patch({ accion: 'borrar_todo' })).status).toBe(400)
    expect((await patch('{mal')).status).toBe(400)
  })
})

describe('Editar una nota', () => {
  it('el autor edita su nota → 200 con el texto nuevo y "editada"', async () => {
    const res = await patch({ accion: 'editar', body: '  Texto nuevo  ' })
    expect(res.status).toBe(200)
    expect(m.editarNota).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Texto nuevo')
    const body = await res.json()
    expect(body.actividad).toMatchObject({ body: 'Texto nuevo', editada: true, autor: { id: 'asesor-1' } })
  })
  it('otra persona (la coordinadora) no puede editarla → 403 sin cambiar la base', async () => {
    como('coordinador')
    const res = await patch({ accion: 'editar', body: 'Otro texto' })
    expect(res.status).toBe(403)
    expect(m.editarNota).not.toHaveBeenCalled()
  })
  it('nota automática: el asesor que figura como autor no la edita → 403', async () => {
    m.leerActividadDelContacto.mockResolvedValue(nota({ automatic: true }))
    const res = await patch({ accion: 'editar', body: 'Otro texto' })
    expect(res.status).toBe(403)
    expect(m.editarNota).not.toHaveBeenCalled()
  })
  it('nota automática: la coordinadora tampoco la edita → 403', async () => {
    como('coordinador')
    m.leerActividadDelContacto.mockResolvedValue(nota({ automatic: true, created_by: 'asesor-1' }))
    expect((await patch({ accion: 'editar', body: 'Otro' })).status).toBe(403)
  })
  it('editar y dejarla vacía → 400 y no se toca', async () => {
    const res = await patch({ accion: 'editar', body: '   ' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Escribí algo para guardar la nota')
    expect(m.editarNota).not.toHaveBeenCalled()
  })
  it('no se puede cambiar el resultado ni el comentario de una llamada → 400', async () => {
    m.leerActividadDelContacto.mockResolvedValue(llamada())
    const res = await patch({ accion: 'editar', body: 'Otro comentario' })
    expect(res.status).toBe(400)
    expect(m.editarNota).not.toHaveBeenCalled()
  })
  it('un pedido que trae call_outcome sin acción → 400', async () => {
    m.leerActividadDelContacto.mockResolvedValue(llamada())
    expect((await patch({ call_outcome: 'agendo' })).status).toBe(400)
  })
})

describe('Borrar una nota', () => {
  it('el autor borra su nota → 200, sin tocar tareas (una nota no es un intento)', async () => {
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.anularActividad).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'asesor-1')
    expect(m.undoTasksOfActivity).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ ok: true, tareas: { descartadas: 0, reabiertas: 0 } })
  })
  it('el asesor no borra la nota automática que lleva su nombre → 403', async () => {
    m.leerActividadDelContacto.mockResolvedValue(nota({ automatic: true }))
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(403)
    expect(m.anularActividad).not.toHaveBeenCalled()
  })
  it('la coordinadora sí borra la nota automática → 200', async () => {
    como('coordinador', 'coord-1')
    m.leerActividadDelContacto.mockResolvedValue(nota({ automatic: true }))
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.anularActividad).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'coord-1')
  })
  it('un asesor no borra la nota de la coordinadora → 403', async () => {
    m.leerActividadDelContacto.mockResolvedValue(nota({ created_by: 'coord-1' }))
    expect((await patch({ accion: 'anular' })).status).toBe(403)
    expect(m.anularActividad).not.toHaveBeenCalled()
  })
  it('la coordinación borra una nota ajena → voided_by es la coordinadora', async () => {
    como('coordinador', 'coord-1')
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.anularActividad).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'coord-1')
  })
})

describe('Anular una llamada o un WhatsApp marcado', () => {
  it('último intento → anula y deshace sus tareas', async () => {
    m.leerActividadDelContacto.mockResolvedValue(llamada({ occurred_at: '2026-11-25T12:00:00.000Z' }))
    m.intentosNoAnulados.mockResolvedValue([intento('act-0', '2026-11-24T12:00:00.000Z')])
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.intentosNoAnulados).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', 'd-1')
    expect(m.undoTasksOfActivity).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-000000000001')
    expect(await res.json()).toEqual({ ok: true, tareas: { descartadas: 1, reabiertas: 2 } })
  })
  it('con un intento posterior → anula pero NO toca tareas', async () => {
    m.leerActividadDelContacto.mockResolvedValue(llamada({ occurred_at: '2026-11-24T12:00:00.000Z' }))
    m.intentosNoAnulados.mockResolvedValue([intento('act-2', '2026-11-25T12:00:00.000Z', 'whatsapp_sent')])
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.anularActividad).toHaveBeenCalled()
    expect(m.undoTasksOfActivity).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ ok: true, tareas: { descartadas: 0, reabiertas: 0 } })
  })
  it('un WhatsApp marcado que es el último intento también deshace sus tareas', async () => {
    m.leerActividadDelContacto.mockResolvedValue(nota({ kind: 'whatsapp_sent', body: null }))
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.undoTasksOfActivity).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-000000000001')
  })
  it('un asesor no anula la llamada de la coordinadora → 403 y sigue en la actividad', async () => {
    m.leerActividadDelContacto.mockResolvedValue(llamada({ created_by: 'coord-1' }))
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(403)
    expect(m.anularActividad).not.toHaveBeenCalled()
    expect(m.undoTasksOfActivity).not.toHaveBeenCalled()
  })
  it('llamada sin proceso: los intentos se leen con deal_id vacío', async () => {
    m.leerActividadDelContacto.mockResolvedValue(llamada({ deal_id: null }))
    await patch({ accion: 'anular' })
    expect(m.intentosNoAnulados).toHaveBeenCalledWith('0000000c-0000-4000-8000-000000000001', null)
  })
})

describe('Anular dos veces (D8)', () => {
  it('ya anulada → 200 sin reescribir voided_at ni voided_by', async () => {
    m.leerActividadDelContacto.mockResolvedValue(nota({ voided_at: '2026-11-25T13:00:00.000Z', voided_by: 'asesor-1' }))
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.anularActividad).not.toHaveBeenCalled()
  })
  it('falla la parte de las tareas → 500; volver a anular descarta y reabre (sin reescribir la anulación)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.leerActividadDelContacto.mockResolvedValueOnce(llamada())
    m.undoTasksOfActivity.mockRejectedValueOnce(new Error('se cortó'))
    const primera = await patch({ accion: 'anular' })
    expect(primera.status).toBe(500)
    // Código distinguible (revisión 12.1): la pantalla saca el registro de la lista aunque
    // las tareas no se hayan deshecho, y ofrece reintentar solo esa parte.
    expect(await primera.json()).toEqual({
      code: 'ANULADA_SIN_TAREAS',
      error: 'Se anuló, pero no se pudieron deshacer sus tareas. Probá de nuevo.',
    })
    expect(m.anularActividad).toHaveBeenCalledTimes(1)

    m.leerActividadDelContacto.mockResolvedValueOnce(llamada({ voided_at: '2026-11-26T10:00:00.000Z', voided_by: 'asesor-1' }))
    const segunda = await patch({ accion: 'anular' })
    expect(segunda.status).toBe(200)
    expect(m.anularActividad).toHaveBeenCalledTimes(1) // no se reescribe
    expect(m.undoTasksOfActivity).toHaveBeenCalledTimes(2)
    expect(await segunda.json()).toEqual({ ok: true, tareas: { descartadas: 1, reabiertas: 2 } })
    err.mockRestore()
  })
  it('anular por segunda vez cuando ya hay un intento posterior → 200 sin tocar tareas', async () => {
    m.leerActividadDelContacto.mockResolvedValue(
      llamada({ occurred_at: '2026-11-24T12:00:00.000Z', voided_at: '2026-11-24T13:00:00.000Z', voided_by: 'asesor-1' }),
    )
    m.intentosNoAnulados.mockResolvedValue([intento('act-2', '2026-11-25T12:00:00.000Z')])
    const res = await patch({ accion: 'anular' })
    expect(res.status).toBe(200)
    expect(m.anularActividad).not.toHaveBeenCalled()
    expect(m.undoTasksOfActivity).not.toHaveBeenCalled()
  })
})

describe('ids que no son uuid (revisión 12.1)', () => {
  it('contacto o registro que no es uuid → 404 sin leer ni escribir', async () => {
    expect((await patch({ accion: 'anular' }, 'no-es-uuid')).status).toBe(404)
    expect((await patch({ accion: 'anular' }, undefined, 'no-es-uuid')).status).toBe(404)
    expect(m.leerActividadDelContacto).not.toHaveBeenCalled()
    expect(m.anularActividad).not.toHaveBeenCalled()
  })
})
