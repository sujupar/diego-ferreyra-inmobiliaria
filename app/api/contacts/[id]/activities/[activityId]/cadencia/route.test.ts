/**
 * POST /api/contacts/[id]/activities/[activityId]/cadencia — "Reintentar" (tarea 6.4,
 * design.md D7). Sin cuerpo: todo sale de la fila guardada. `aplicarCadencia` corre de
 * verdad sobre la base simulada en memoria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearBaseSimulada, type BaseSimulada } from '../../base-simulada'
import type { FilaActividad } from '@/lib/supabase/actividades'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1', nombre: 'Cora Coordinadora' },
  canAccessContact: vi.fn(),
  base: null as unknown as BaseSimulada,
}))
const { delegar } = vi.hoisted(() => ({
  delegar:
    (nombre: string) =>
    (...a: unknown[]) =>
      (m.base[nombre as keyof BaseSimulada] as (...x: unknown[]) => unknown)(...a),
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
  leerActividadDelContacto: delegar('leerActividadDelContacto'),
  existeContacto: async (id: string) => m.base.contactos.has(id),
  intentosNoAnulados: delegar('intentosNoAnulados'),
  leerProcesoParaCadencia: delegar('leerProcesoParaCadencia'),
  nombreDelContacto: delegar('nombreDelContacto'),
  rolDePerfil: delegar('rolDePerfil'),
  nombresDePerfiles: delegar('nombresDePerfiles'),
}))
vi.mock('@/lib/supabase/tasks', () => ({
  getPendingTasksForContact: delegar('getPendingTasksForContact'),
  closeTasksByActivity: delegar('closeTasksByActivity'),
  createCadenceTask: delegar('createCadenceTask'),
  getTasksOfActivity: delegar('getTasksOfActivity'),
}))

import { POST } from './route'

const MIERCOLES = new Date('2026-11-25T15:00:00.000Z') // miércoles 12:00 de Argentina
let tokens = 0

const reintentar = (activityId: string, id = '0000000c-0000-4000-8000-000000000001') =>
  POST(new Request(`http://local/api/contacts/${id}/activities/${activityId}/cadencia`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id, activityId }),
  })
const como = (role: string, id: string, nombre = id) => {
  m.estado.role = role
  m.estado.id = id
  m.estado.nombre = nombre
}

/** Guarda una actividad SIN correr la cadencia: lo que deja un guardado cuya tarea falló. */
async function guardada(cambios: Partial<FilaActividad> & { created_by: string | null }): Promise<FilaActividad> {
  const r = await b.insertarActividad({
    contact_id: cambios.contact_id ?? '0000000c-0000-4000-8000-000000000001',
    deal_id: cambios.deal_id === undefined ? 'd-sol' : cambios.deal_id,
    kind: cambios.kind ?? 'call',
    call_outcome: (cambios.kind ?? 'call') === 'call' ? (cambios.call_outcome ?? 'no_atendio') : null,
    callback_at: cambios.callback_at ?? null,
    body: null,
    created_by: cambios.created_by ?? 'x', // se pisa abajo si viene null
    client_token: `tok-${++tokens}`,
  })
  if (!r.ok) throw new Error('token repetido en el test')
  const fila = b.actividades.find((a) => a.id === r.fila.id)
  if (!fila) throw new Error('no quedó guardada')
  fila.created_by = cambios.created_by
  return { ...fila }
}

let b: BaseSimulada
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MIERCOLES)
  vi.clearAllMocks()
  b = crearBaseSimulada()
  m.base = b
  como('coordinador', 'coord-1', 'Cora Coordinadora')
  m.canAccessContact.mockResolvedValue(true)
  b.contactos.set('0000000c-0000-4000-8000-000000000001', '[TEST] Ana')
  b.contactos.set('0000000c-0000-4000-8000-000000000002', '[TEST] Beto')
  b.perfiles.set('coord-1', { role: 'coordinador', nombre: 'Cora Coordinadora' })
  b.perfiles.set('coord-2', { role: 'coordinador', nombre: 'Coca' })
  b.perfiles.set('asesor-1', { role: 'asesor', nombre: 'Aldo Asesor' })
  b.perfiles.set('asesor-2', { role: 'asesor', nombre: 'Berta Asesora' })
  b.procesos.push({ id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001', stage: 'request', assigned_to: null, scheduled_date: null, origin: null, created_at: '2026-11-20T10:00:00Z' })
  b.tarea({ id: 't-entrada', title: 'Contactar a [TEST] Ana', type: 'update_contact', channel: null, assigned_to: 'coord-1', deal_id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001' })
})
afterEach(() => vi.useRealTimers())

const tareasDe = (activityId: string) => b.tareas.filter((t) => t.source_activity_id === activityId)

describe('POST …/cadencia — reintento', () => {
  it('reintento que funciona → 200, crea la tarea que faltaba y cierra la de entrada', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    const res = await reintentar(a.id)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pendiente).toBe(false)
    expect(body.cadencia.tareaCreada).toMatchObject({ title: 'Llamada 2 a [TEST] Ana', due_date: '2026-11-26' })
    expect(body.cadencia.tareasCerradas).toEqual([{ id: 't-entrada', title: 'Contactar a [TEST] Ana' }])
    expect(body.actividad).toMatchObject({ id: a.id, intento: 1, autor: { id: 'coord-1', nombre: 'Cora Coordinadora' } })
    expect(body.actividad.tarea_creada?.title).toBe('Llamada 2 a [TEST] Ana')
  })

  it('doble reintento → no duplica y responde lo mismo', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    const r1 = await (await reintentar(a.id)).json()
    const r2 = await (await reintentar(a.id)).json()
    expect(r2).toEqual(r1)
    expect(tareasDe(a.id)).toHaveLength(1)
  })

  it('reintento de la tercera "No atendió" que ya había creado su "Enviar WhatsApp" → la misma tarea, motivo en null', async () => {
    await guardada({ created_by: 'coord-1' })
    await guardada({ created_by: 'coord-1' })
    const segunda = await guardada({ created_by: 'coord-1' })
    const r1 = await (await reintentar(segunda.id)).json()
    expect(r1.cadencia.tareaCreada?.title).toBe('Enviar WhatsApp a [TEST] Ana')
    const r2 = await (await reintentar(segunda.id)).json()
    expect(r2.cadencia.tareaCreada?.id).toBe(r1.cadencia.tareaCreada.id)
    expect(r2.cadencia.motivoSinTarea).toBeNull()
    expect(tareasDe(segunda.id)).toHaveLength(1)
  })

  it('reintento de un "volver a llamar" → usa callback_at', async () => {
    const a = await guardada({ created_by: 'coord-1', call_outcome: 'volver_a_llamar', callback_at: '2026-11-27T19:30:00.000Z' })
    const body = await (await reintentar(a.id)).json()
    expect(body.cadencia.tareaCreada).toMatchObject({ title: 'Llamar a [TEST] Ana', due_date: '2026-11-27', due_time: '16:30:00' })
  })

  it('reintento al día siguiente → el día hábil se cuenta desde created_at, no desde el reintento', async () => {
    const a = await guardada({ created_by: 'coord-1' }) // miércoles
    vi.setSystemTime(new Date('2026-11-26T15:00:00.000Z')) // jueves
    const body = await (await reintentar(a.id)).json()
    expect(body.cadencia.tareaCreada?.due_date).toBe('2026-11-26') // jueves, no viernes
  })

  it('reintento de otra persona → tarea al autor original y tareas a cerrar elegidas con el autor original', async () => {
    b.procesos[0].assigned_to = 'asesor-1'
    b.tarea({ id: 't-manual-suya', title: 'Llamar (a mano)', assigned_to: 'asesor-1', deal_id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001' })
    b.tarea({ id: 't-manual-otro', title: 'Llamar (a mano)', assigned_to: 'asesor-2', deal_id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001' })
    const a = await guardada({ created_by: 'asesor-1' })
    const body = await (await reintentar(a.id)).json()
    expect(tareasDe(a.id)[0]?.assigned_to).toBe('asesor-1')
    const cerradas = body.cadencia.tareasCerradas.map((t: { id: string }) => t.id).sort()
    expect(cerradas).toEqual(['t-entrada', 't-manual-suya']) // la manual del otro asesor no
  })

  it('coordinadora reintenta una "No atendió" cuyo autor ya no existe → "Llamada 2" a su nombre, no proceso_ajeno', async () => {
    b.procesos[0].assigned_to = 'asesor-1'
    const a = await guardada({ created_by: null })
    const body = await (await reintentar(a.id)).json()
    expect(body.cadencia.motivoSinTarea).toBeNull()
    expect(body.cadencia.tareaCreada?.title).toBe('Llamada 2 a [TEST] Ana')
    expect(tareasDe(a.id)[0]?.assigned_to).toBe('coord-1')
    expect(body.actividad.autor).toBeNull()
  })

  it('entró otra solicitud entre medio → la tarea queda con el deal_id de la actividad', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    b.procesos.push({ id: 'd-nueva', contact_id: '0000000c-0000-4000-8000-000000000001', stage: 'request', assigned_to: null, scheduled_date: null, origin: null, created_at: '2026-11-25T14:00:00Z' })
    const body = await (await reintentar(a.id)).json()
    expect(tareasDe(a.id)[0]?.deal_id).toBe('d-sol')
    expect(body.cadencia.dealId).toBe('d-sol')
  })

  it('el proceso se cerró mientras tanto: "No atendió" → sin_proceso', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    b.procesos[0].stage = 'lost'
    const body = await (await reintentar(a.id)).json()
    expect(body.cadencia.motivoSinTarea).toBe('sin_proceso')
    expect(tareasDe(a.id)).toHaveLength(0)
  })

  it('el proceso se cerró mientras tanto: "volver a llamar" → crea su tarea, ligada a ese proceso', async () => {
    const a = await guardada({ created_by: 'coord-1', call_outcome: 'volver_a_llamar', callback_at: '2026-11-27T19:30:00.000Z' })
    b.procesos[0].stage = 'lost'
    await reintentar(a.id)
    expect(tareasDe(a.id)[0]?.deal_id).toBe('d-sol')
  })

  it('asesor reintenta una "Agendó" de la coordinadora → ofrecer según el asesor (sin botón de coordinar)', async () => {
    b.procesos[0].assigned_to = 'asesor-2'
    const a = await guardada({ created_by: 'coord-1', call_outcome: 'agendo' })
    como('asesor', 'asesor-1')
    const body = await (await reintentar(a.id)).json()
    expect(body.cadencia.ofrecer).toBe('pedir_coordinacion')
  })

  it('con un intento posterior → no toca nada', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    await guardada({ created_by: 'coord-1' })
    const antes = JSON.stringify(b.tareas)
    const body = await (await reintentar(a.id)).json()
    expect(body.cadencia).toMatchObject({ aplica: false, motivoSinTarea: 'fuera_de_orden' })
    expect(JSON.stringify(b.tareas)).toBe(antes)
  })

  it('falla crear dos veces → 200 con pendiente verdadero', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    b.fallarCrear = 2
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = await (await reintentar(a.id)).json()
    expect(body.pendiente).toBe(true)
    err.mockRestore()
  })
})

describe('POST …/cadencia — lo que no se reintenta', () => {
  it('actividad de otro contacto → 404', async () => {
    const a = await guardada({ created_by: 'coord-1', contact_id: '0000000c-0000-4000-8000-000000000002', deal_id: null })
    const res = await reintentar(a.id, '0000000c-0000-4000-8000-000000000001')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(tareasDe(a.id)).toHaveLength(0)
  })

  it('actividad anulada → 404', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    const fila = b.actividades.find((x) => x.id === a.id)
    if (fila) fila.voided_at = b.ahora()
    expect((await reintentar(a.id)).status).toBe(404)
    expect(tareasDe(a.id)).toHaveLength(0)
  })

  it('una nota → 404 (no tiene cadencia)', async () => {
    const a = await guardada({ created_by: 'coord-1', kind: 'note' })
    expect((await reintentar(a.id)).status).toBe(404)
  })

  it('actividad que no existe → 404', async () => {
    expect((await reintentar('act-inventada')).status).toBe(404)
  })

  it('quien no puede ver el contacto → 404 sin tocar nada', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    como('asesor', 'asesor-1')
    m.canAccessContact.mockResolvedValue(false)
    expect((await reintentar(a.id)).status).toBe(404)
    expect(tareasDe(a.id)).toHaveLength(0)
  })

  it('contacto inexistente para la coordinadora → 404', async () => {
    expect((await reintentar('aaaaaaaa-0000-4000-8000-000000000001', 'c-no-existe')).status).toBe(404)
  })

  it('abogado → 403', async () => {
    const a = await guardada({ created_by: 'coord-1' })
    como('abogado', 'abo-1')
    expect((await reintentar(a.id)).status).toBe(403)
    expect(tareasDe(a.id)).toHaveLength(0)
  })
})

describe('ids que no son uuid (revisión 12.1)', () => {
  it('contacto o registro que no es uuid → 404', async () => {
    expect((await reintentar('no-es-uuid')).status).toBe(404)
    expect((await reintentar('aaaaaaaa-0000-4000-8000-000000000001', 'no-es-uuid')).status).toBe(404)
  })
})
