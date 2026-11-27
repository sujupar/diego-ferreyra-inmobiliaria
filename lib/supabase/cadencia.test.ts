/**
 * `aplicarCadencia` (design.md D4 paso 3 y D7) con la base simulada: se simulan las
 * funciones de `actividades.ts` y `tasks.ts`, y se mira en qué orden se llaman, con qué
 * datos, y que la respuesta salga de `getTasksOfActivity` y no de lo que escribió.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FilaActividad } from './actividades'

const m = vi.hoisted(() => ({
  orden: [] as string[],
  leerProcesoParaCadencia: vi.fn(),
  nombreDelContacto: vi.fn(),
  rolDePerfil: vi.fn(),
  intentosNoAnulados: vi.fn(),
  getPendingTasksForContact: vi.fn(),
  closeTasksByActivity: vi.fn(),
  createCadenceTask: vi.fn(),
  getTasksOfActivity: vi.fn(),
}))

vi.mock('./actividades', () => ({
  leerProcesoParaCadencia: m.leerProcesoParaCadencia,
  nombreDelContacto: m.nombreDelContacto,
  rolDePerfil: m.rolDePerfil,
  intentosNoAnulados: m.intentosNoAnulados,
}))
vi.mock('./tasks', () => ({
  getPendingTasksForContact: m.getPendingTasksForContact,
  closeTasksByActivity: m.closeTasksByActivity,
  createCadenceTask: m.createCadenceTask,
  getTasksOfActivity: m.getTasksOfActivity,
}))

import { aplicarCadencia, CADENCIA_VACIA } from './cadencia'

// Miércoles 2026-11-25 12:00 de Argentina.
const CARGADA = '2026-11-25T15:00:00.000Z'

const actividad = (cambios: Partial<FilaActividad> = {}): FilaActividad => ({
  id: 'act-1',
  contact_id: 'c-1',
  deal_id: 'd-sol',
  kind: 'call',
  call_outcome: 'no_atendio',
  body: null,
  occurred_at: CARGADA,
  callback_at: null,
  created_at: CARGADA,
  updated_at: null,
  created_by: 'coord-1',
  voided_at: null,
  voided_by: null,
  automatic: false,
  client_token: 'tok',
  ...cambios,
})

const intento = (a: FilaActividad) => ({
  id: a.id,
  deal_id: a.deal_id,
  kind: a.kind,
  call_outcome: a.call_outcome,
  occurred_at: a.occurred_at,
  created_at: a.created_at,
})

const SOLICITUD = { id: 'd-sol', stage: 'request', assigned_to: null, scheduled_date: null, origin: null }
const COORD = { id: 'coord-1', role: 'coordinador' as const }
const ASESOR = { id: 'asesor-1', role: 'asesor' as const }

const tareaEntrada = {
  id: 't-entrada',
  title: 'Contactar a [TEST] Ana',
  type: 'update_contact',
  channel: null,
  assigned_to: 'coord-1',
  assigned_role: 'coordinador',
  created_at: '2026-11-24T10:00:00.000Z',
  deal_id: 'd-sol',
  contact_id: 'c-1',
  appraisal_id: null,
  source_activity_id: null,
}

function registrar(nombre: string, fn: (...a: unknown[]) => unknown) {
  return async (...a: unknown[]) => {
    m.orden.push(nombre)
    return fn(...a)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.orden.length = 0
  m.leerProcesoParaCadencia.mockImplementation(registrar('leerProceso', () => SOLICITUD))
  m.nombreDelContacto.mockImplementation(registrar('nombre', () => '[TEST] Ana'))
  m.rolDePerfil.mockImplementation(registrar('rol', (id) => (id === 'coord-1' ? 'coordinador' : id === 'asesor-1' ? 'asesor' : null)))
  m.intentosNoAnulados.mockImplementation(registrar('intentos', () => [intento(actividad())]))
  m.getPendingTasksForContact.mockImplementation(registrar('pendientes', () => [tareaEntrada]))
  m.closeTasksByActivity.mockImplementation(registrar('cerrar', (ids) => ids))
  m.createCadenceTask.mockImplementation(registrar('crear', () => ({ id: 't-nueva', yaExistia: false })))
  m.getTasksOfActivity.mockImplementation(
    registrar('leerTareas', () => ({
      creada: { id: 't-nueva', title: 'Llamada 2 a [TEST] Ana', due_date: '2026-11-26', due_time: '09:00:00', channel: 'call' },
      cerradas: [{ id: 't-entrada', title: 'Contactar a [TEST] Ana' }],
    })),
  )
})

describe('aplicarCadencia', () => {
  it('orden de los pasos: lee, cierra, crea y arma la respuesta leyendo la base', async () => {
    const r = await aplicarCadencia(actividad(), COORD)
    const escrituras = m.orden.filter((x) => ['cerrar', 'crear', 'leerTareas'].includes(x))
    expect(escrituras).toEqual(['cerrar', 'crear', 'leerTareas'])
    expect(m.orden.indexOf('pendientes')).toBeLessThan(m.orden.indexOf('cerrar'))
    expect(m.closeTasksByActivity).toHaveBeenCalledWith(['t-entrada'], 'act-1', 'coord-1')
    expect(m.createCadenceTask).toHaveBeenCalledWith({
      type: 'follow_up',
      title: 'Llamada 2 a [TEST] Ana',
      assigned_to: 'coord-1',
      created_by: 'coord-1',
      deal_id: 'd-sol',
      contact_id: 'c-1',
      channel: 'call',
      due_date: '2026-11-26',
      due_time: '09:00',
      all_day: false,
      source_activity_id: 'act-1',
    })
    expect(m.getPendingTasksForContact).toHaveBeenCalledWith('c-1', ['d-sol'])
    expect(m.intentosNoAnulados).toHaveBeenCalledWith('c-1', 'd-sol')
    expect(r).toEqual({
      intento: 1,
      pendiente: false,
      cadencia: {
        aplica: true,
        tareaCreada: { id: 't-nueva', title: 'Llamada 2 a [TEST] Ana', due_date: '2026-11-26', due_time: '09:00:00', channel: 'call' },
        motivoSinTarea: null,
        tareasCerradas: [{ id: 't-entrada', title: 'Contactar a [TEST] Ana' }],
        ofrecer: null,
        dealId: 'd-sol',
      },
    })
  })

  it('el proceso es el de la actividad, no se busca el activo', async () => {
    await aplicarCadencia(actividad({ deal_id: 'd-viejo' }), COORD)
    expect(m.leerProcesoParaCadencia).toHaveBeenCalledWith('d-viejo')
  })

  it('autor borrado (created_by vacío): procesoPropio y la asignación salen de quien pide', async () => {
    m.leerProcesoParaCadencia.mockResolvedValue({ ...SOLICITUD, assigned_to: 'asesor-2' })
    const r = await aplicarCadencia(actividad({ created_by: null }), COORD)
    expect(r.cadencia.motivoSinTarea).not.toBe('proceso_ajeno')
    expect(m.createCadenceTask.mock.calls[0][0].assigned_to).toBe('coord-1')
    expect(m.createCadenceTask.mock.calls[0][0].created_by).toBe('coord-1')
  })

  it('autor cuyo perfil ya no existe: igual que borrado', async () => {
    m.leerProcesoParaCadencia.mockResolvedValue({ ...SOLICITUD, assigned_to: 'asesor-2' })
    const r = await aplicarCadencia(actividad({ created_by: 'fantasma' }), COORD)
    expect(r.cadencia.motivoSinTarea).not.toBe('proceso_ajeno')
    expect(m.createCadenceTask.mock.calls[0][0].assigned_to).toBe('coord-1')
  })

  it('tareas a nombre de quien REGISTRÓ aunque pida otra persona', async () => {
    await aplicarCadencia(actividad({ created_by: 'coord-1' }), { id: 'coord-2', role: 'coordinador' })
    expect(m.createCadenceTask.mock.calls[0][0].assigned_to).toBe('coord-1')
  })

  it('asesor sobre un proceso ajeno: No atendió → proceso_ajeno, sin crear y sin cerrar tareas de otros', async () => {
    m.leerProcesoParaCadencia.mockResolvedValue({ ...SOLICITUD, assigned_to: 'asesor-2' })
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [] })
    const r = await aplicarCadencia(actividad({ created_by: 'asesor-1' }), ASESOR)
    expect(r.cadencia.motivoSinTarea).toBe('proceso_ajeno')
    expect(r.cadencia.aplica).toBe(true)
    expect(m.createCadenceTask).not.toHaveBeenCalled()
    // `soloPropias`: la tarea de entrada de la coordinación no entra.
    expect(m.closeTasksByActivity).not.toHaveBeenCalled()
  })

  it('ofrecer se calcula con quien PIDE: Agendó de la coordinadora reintentado por un asesor → pedir_coordinacion', async () => {
    m.leerProcesoParaCadencia.mockResolvedValue({ ...SOLICITUD, assigned_to: 'asesor-2' })
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [] })
    const r = await aplicarCadencia(actividad({ call_outcome: 'agendo' }), ASESOR)
    expect(r.cadencia.ofrecer).toBe('pedir_coordinacion')
    const r2 = await aplicarCadencia(actividad({ call_outcome: 'agendo' }), COORD)
    expect(r2.cadencia.ofrecer).toBe('coordinar_solicitud')
  })

  it('volver a llamar: la tarea va al día y la hora de callback_at en Argentina', async () => {
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [] })
    await aplicarCadencia(actividad({ call_outcome: 'volver_a_llamar', callback_at: '2026-11-27T19:30:00.000Z' }), COORD)
    expect(m.createCadenceTask.mock.calls[0][0]).toMatchObject({
      title: 'Llamar a [TEST] Ana',
      due_date: '2026-11-27',
      due_time: '16:30',
      channel: 'call',
    })
  })

  it('WhatsApp marcado: cierra también la Enviar WhatsApp de la cadencia y no crea nada', async () => {
    const wa = { ...tareaEntrada, id: 't-wa', type: 'follow_up', channel: 'message', source_activity_id: 'act-0' }
    m.getPendingTasksForContact.mockResolvedValue([wa])
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [{ id: 't-wa', title: 'Enviar WhatsApp' }] })
    const a = actividad({ kind: 'whatsapp_sent', call_outcome: null })
    m.intentosNoAnulados.mockResolvedValue([intento(a)])
    const r = await aplicarCadencia(a, COORD)
    expect(m.closeTasksByActivity).toHaveBeenCalledWith(['t-wa'], 'act-1', 'coord-1')
    expect(m.createCadenceTask).not.toHaveBeenCalled()
    expect(r.intento).toBeNull()
    expect(r.cadencia.motivoSinTarea).toBe('secuencia_terminada')
  })

  it('motivoSinTarea va en null siempre que la lectura traiga una tarea creada', async () => {
    // La decisión de ahora diría "ya hay una pendiente" (otra tarea de WhatsApp de la
    // cadencia), pero la base dice que esta actividad ya creó la suya.
    const otra = { ...tareaEntrada, id: 't-wa-otra', type: 'follow_up', channel: 'message', source_activity_id: 'act-0' }
    m.getPendingTasksForContact.mockResolvedValue([otra])
    const r = await aplicarCadencia(actividad(), COORD)
    expect(r.cadencia.tareaCreada?.id).toBe('t-nueva')
    expect(r.cadencia.motivoSinTarea).toBeNull()
  })

  it('aplica en verdadero si la base trae tareas de esta actividad aunque ahora sea fuera de orden', async () => {
    const posterior = { ...intento(actividad()), id: 'act-2', occurred_at: '2026-11-25T16:00:00.000Z', created_at: '2026-11-25T16:00:00.000Z' }
    m.intentosNoAnulados.mockResolvedValue([intento(actividad()), posterior])
    const r = await aplicarCadencia(actividad(), COORD)
    expect(m.closeTasksByActivity).not.toHaveBeenCalled()
    expect(m.createCadenceTask).not.toHaveBeenCalled()
    expect(r.cadencia.aplica).toBe(true)
    expect(r.cadencia.motivoSinTarea).toBeNull()
  })

  it('fuera de orden sin tareas en la base → aplica falso, fuera_de_orden, nada tocado', async () => {
    const posterior = { ...intento(actividad()), id: 'act-2', occurred_at: '2026-11-25T16:00:00.000Z', created_at: '2026-11-25T16:00:00.000Z' }
    m.intentosNoAnulados.mockResolvedValue([intento(actividad()), posterior])
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [] })
    const r = await aplicarCadencia(actividad(), COORD)
    expect(r.cadencia).toMatchObject({ aplica: false, motivoSinTarea: 'fuera_de_orden', tareaCreada: null, tareasCerradas: [] })
  })

  it('crear falla una vez y anda al reintento → pendiente falso', async () => {
    m.createCadenceTask.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce({ id: 't-nueva', yaExistia: false })
    const r = await aplicarCadencia(actividad(), COORD)
    expect(m.createCadenceTask).toHaveBeenCalledTimes(2)
    expect(r.pendiente).toBe(false)
  })

  it('crear falla dos veces → pendiente verdadero, con lo que sí logró y console.error con el id', async () => {
    m.createCadenceTask.mockRejectedValue(new Error('red'))
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [{ id: 't-entrada', title: 'Contactar a [TEST] Ana' }] })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await aplicarCadencia(actividad(), COORD)
    expect(r.pendiente).toBe(true)
    expect(r.cadencia.tareasCerradas).toHaveLength(1)
    expect(JSON.stringify(err.mock.calls)).toContain('act-1')
    err.mockRestore()
  })

  it('cerrar falla dos veces → igual intenta crear, y pendiente verdadero', async () => {
    m.closeTasksByActivity.mockRejectedValue(new Error('red'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await aplicarCadencia(actividad(), COORD)
    expect(m.closeTasksByActivity).toHaveBeenCalledTimes(2)
    expect(m.createCadenceTask).toHaveBeenCalledTimes(1)
    expect(r.pendiente).toBe(true)
    err.mockRestore()
  })

  it('sin proceso: lee pendientes solo del contacto y no lee proceso', async () => {
    const a = actividad({ deal_id: null })
    m.intentosNoAnulados.mockResolvedValue([intento(a)])
    m.getTasksOfActivity.mockResolvedValue({ creada: null, cerradas: [] })
    const r = await aplicarCadencia(a, COORD)
    expect(m.leerProcesoParaCadencia).not.toHaveBeenCalled()
    expect(m.getPendingTasksForContact).toHaveBeenCalledWith('c-1', [])
    expect(r.cadencia.motivoSinTarea).toBe('sin_proceso')
    expect(r.cadencia.dealId).toBeNull()
  })

  it('CADENCIA_VACIA: lo que responde un token repetido de una actividad anulada', () => {
    expect(CADENCIA_VACIA).toEqual({ aplica: false, tareaCreada: null, motivoSinTarea: null, tareasCerradas: [], ofrecer: null, dealId: null })
  })
})
