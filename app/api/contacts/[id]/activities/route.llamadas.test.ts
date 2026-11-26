/**
 * POST /api/contacts/[id]/activities — llamadas y WhatsApp con la cadencia (tarea 6.2).
 * `aplicarCadencia` corre de verdad sobre una base simulada en memoria (`base-simulada.ts`)
 * que respeta las reglas de la base real; se mira lo que queda guardado y la respuesta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearBaseSimulada, type BaseSimulada } from './base-simulada'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1', nombre: 'Cora Coordinadora' },
  canAccessContact: vi.fn(),
  base: null as unknown as BaseSimulada,
}))
// Cada función simulada busca su implementación en la base del test en curso (y así un
// `vi.spyOn(b, …)` la ve).
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
  leerProcesosDelContacto: delegar('leerProcesosDelContacto'),
  insertarActividad: delegar('insertarActividad'),
  leerActividadPorToken: delegar('leerActividadPorToken'),
  intentosNoAnulados: delegar('intentosNoAnulados'),
  leerProcesoParaCadencia: delegar('leerProcesoParaCadencia'),
  nombreDelContacto: delegar('nombreDelContacto'),
  rolDePerfil: delegar('rolDePerfil'),
}))
vi.mock('@/lib/supabase/tasks', () => ({
  getPendingTasksForContact: delegar('getPendingTasksForContact'),
  closeTasksByActivity: delegar('closeTasksByActivity'),
  createCadenceTask: delegar('createCadenceTask'),
  getTasksOfActivity: delegar('getTasksOfActivity'),
}))

import { POST } from './route'

const TOKEN = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'
const TOKEN_2 = '4a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const AHORA = new Date('2026-11-25T15:00:00.000Z') // miércoles 12:00 de Argentina

const post = (body: unknown, id = '0000000c-0000-4000-8000-000000000001') =>
  POST(
    new Request(`http://local/api/contacts/${id}/activities`, { method: 'POST', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id }) },
  )
const como = (role: string, id: string, nombre = id) => {
  m.estado.role = role
  m.estado.id = id
  m.estado.nombre = nombre
}
const llamada = (call_outcome: string, extra: Record<string, unknown> = {}, client_token = TOKEN) => ({
  kind: 'call',
  call_outcome,
  client_token,
  ...extra,
})

let b: BaseSimulada
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  b = crearBaseSimulada()
  m.base = b
  como('coordinador', 'coord-1', 'Cora Coordinadora')
  m.canAccessContact.mockResolvedValue(true)
  b.contactos.set('0000000c-0000-4000-8000-000000000001', '[TEST] Ana')
  b.perfiles.set('coord-1', { role: 'coordinador', nombre: 'Cora Coordinadora' })
  b.perfiles.set('coord-2', { role: 'coordinador', nombre: 'Coca' })
  b.perfiles.set('asesor-1', { role: 'asesor', nombre: 'Aldo Asesor' })
  b.perfiles.set('asesor-2', { role: 'asesor', nombre: 'Berta Asesora' })
  b.procesos.push({ id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001', stage: 'request', assigned_to: null, scheduled_date: null, origin: null, created_at: '2026-11-20T10:00:00Z' })
  // Tarea de entrada de la coordinación, creada antes que cualquier llamada.
  b.tarea({ id: 't-entrada', title: 'Contactar a [TEST] Ana', type: 'update_contact', channel: null, assigned_to: 'coord-1', deal_id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001' })
})
afterEach(() => vi.useRealTimers())

const pendientes = () => b.tareas.filter((t) => t.status === 'pending').map((t) => t.id)

describe('POST — cada resultado de llamada', () => {
  it('No atendió → 201, Llamada 1, cierra la de entrada y crea "Llamada 2" para el día hábil siguiente', async () => {
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.actividad).toMatchObject({ kind: 'call', call_outcome: 'no_atendio', intento: 1, titulo: 'Llamada 1 · No atendió', deal_id: 'd-sol' })
    expect(body.actividad.tarea_creada).toMatchObject({ title: 'Llamada 2 a [TEST] Ana', due_date: '2026-11-26' })
    expect(body.cadencia).toMatchObject({
      aplica: true,
      motivoSinTarea: null,
      tareasCerradas: [{ id: 't-entrada', title: 'Contactar a [TEST] Ana' }],
      ofrecer: null,
      dealId: 'd-sol',
    })
    expect(body.cadencia.tareaCreada).toMatchObject({ title: 'Llamada 2 a [TEST] Ana', due_date: '2026-11-26', channel: 'call' })
    expect(body.pendiente).toBe(false)
    const nueva = b.tareas.find((t) => t.source_activity_id === body.actividad.id)
    expect(nueva?.assigned_to).toBe('coord-1') // registranteId = autor
  })

  it('Agendó (coordinadora, Solicitud) → coordinar_solicitud y no crea tarea', async () => {
    const body = await (await post(llamada('agendo'))).json()
    expect(body.cadencia).toMatchObject({ ofrecer: 'coordinar_solicitud', motivoSinTarea: 'no_corresponde', tareaCreada: null })
    expect(pendientes()).toEqual([])
  })

  it.each(['no_interesa', 'numero_equivocado'])('%s → cerrar_proceso', async (r) => {
    const body = await (await post(llamada(r))).json()
    expect(body.cadencia).toMatchObject({ ofrecer: 'cerrar_proceso', tareaCreada: null })
  })

  it('volver a llamar → guarda callback_at y crea "Llamar a" para ese día y hora', async () => {
    const res = await post(llamada('volver_a_llamar', { volver_el: { fecha: '2026-11-27', hora: '16:30' } }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(b.actividades[0].callback_at).toBe('2026-11-27T19:30:00.000Z')
    expect(body.cadencia.tareaCreada).toMatchObject({ title: 'Llamar a [TEST] Ana', due_date: '2026-11-27', due_time: '16:30:00' })
  })

  it('volver a llamar sin fecha → 400 y no se guarda nada', async () => {
    const res = await post(llamada('volver_a_llamar'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Elegí el día y la hora para volver a llamar.')
    expect(b.actividades).toHaveLength(0)
  })

  it('volver a llamar con fecha pasada → 400', async () => {
    const res = await post(llamada('volver_a_llamar', { volver_el: { fecha: '2026-11-24', hora: '10:00' } }))
    expect(res.status).toBe(400)
    expect(b.actividades).toHaveLength(0)
  })

  it('volver_el con otro resultado se ignora', async () => {
    await post(llamada('no_atendio', { volver_el: { fecha: '2026-11-27', hora: '16:30' } }))
    expect(b.actividades[0].callback_at).toBeNull()
  })

  it.each([10081, -1, 2.5])('hace_minutos %s → 400 y no se guarda nada', async (min) => {
    const res = await post(llamada('no_atendio', { hace_minutos: min }))
    expect(res.status).toBe(400)
    expect(b.actividades).toHaveLength(0)
  })
})

describe('POST — la hora', () => {
  it('sin hace_minutos el insert no lleva occurred_at ("Por defecto es ahora")', async () => {
    const espia = vi.spyOn(b, 'insertarActividad')
    await post(llamada('no_atendio'))
    expect(espia.mock.calls[0][0]).not.toHaveProperty('occurred_at')
  })

  it('un occurred_at propio en el cuerpo ("Fecha suelta en el pedido") → 201 y no llega al insert', async () => {
    const espia = vi.spyOn(b, 'insertarActividad')
    const res = await post(llamada('no_atendio', { occurred_at: '2020-01-01T00:00:00Z' }))
    expect(res.status).toBe(201)
    expect(espia.mock.calls[0][0]).not.toHaveProperty('occurred_at')
    expect(b.actividades[0].occurred_at).toBe(b.actividades[0].created_at)
  })

  it('"Marcar WhatsApp enviado" con comentario y hace_minutos 30 guarda los dos', async () => {
    const res = await post({ kind: 'whatsapp_sent', body: 'Le mandé las fotos', hace_minutos: 30, client_token: TOKEN })
    expect(res.status).toBe(201)
    const fila = b.actividades[0]
    expect(fila.body).toBe('Le mandé las fotos')
    expect(fila.occurred_at).toBe(new Date(AHORA.getTime() - 30 * 60_000).toISOString())
    const body = await res.json()
    expect(body.actividad).toMatchObject({ kind: 'whatsapp_sent', intento: null, titulo: 'WhatsApp enviado' })
    expect(body.cadencia.motivoSinTarea).toBe('secuencia_terminada')
  })
})

describe('POST — orden y procesos', () => {
  it('intento fuera de orden → aplica falso, ninguna tarea tocada', async () => {
    await post(llamada('no_atendio'))
    const antes = JSON.stringify(b.tareas)
    const res = await post(llamada('no_atendio', { hace_minutos: 60 }, TOKEN_2))
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.cadencia).toMatchObject({ aplica: false, motivoSinTarea: 'fuera_de_orden', tareaCreada: null, tareasCerradas: [] })
    expect(body.actividad.intento).toBe(1) // es anterior: queda como Llamada 1
    expect(JSON.stringify(b.tareas)).toBe(antes)
  })

  it('dos solicitudes abiertas → la llamada se liga a la más nueva y cierra solo sus tareas de entrada', async () => {
    b.procesos.push({ id: 'd-sol-2', contact_id: '0000000c-0000-4000-8000-000000000001', stage: 'request', assigned_to: null, scheduled_date: null, origin: null, created_at: '2026-11-24T10:00:00Z' })
    b.tarea({ id: 't-entrada-2', type: 'update_contact', channel: null, assigned_to: 'coord-1', deal_id: 'd-sol-2', contact_id: '0000000c-0000-4000-8000-000000000001' })
    const body = await (await post(llamada('no_atendio'))).json()
    expect(body.actividad.deal_id).toBe('d-sol-2')
    expect(body.cadencia.tareasCerradas.map((t: { id: string }) => t.id)).toEqual(['t-entrada-2'])
    expect(pendientes()).toContain('t-entrada')
  })

  it('Agendó con el proceso en Coordinada, asesor que no lo lleva → proceso_ya_coordinado', async () => {
    b.procesos[0].stage = 'scheduled'
    b.procesos[0].scheduled_date = '2026-11-28'
    b.procesos[0].assigned_to = 'asesor-2'
    como('asesor', 'asesor-1')
    const body = await (await post(llamada('agendo'))).json()
    expect(body.cadencia.ofrecer).toBe('proceso_ya_coordinado')
  })

  it('Agendó en Coordinada, coordinadora → abrir_proceso', async () => {
    b.procesos[0].stage = 'scheduled'
    b.procesos[0].scheduled_date = '2026-11-28'
    const body = await (await post(llamada('agendo'))).json()
    expect(body.cadencia.ofrecer).toBe('abrir_proceso')
  })

  it('asesor sobre su propia solicitud: Agendó → coordinar_solicitud (calculado con quien pide)', async () => {
    b.procesos[0].assigned_to = 'asesor-1'
    como('asesor', 'asesor-1')
    const body = await (await post(llamada('agendo'))).json()
    expect(body.cadencia.ofrecer).toBe('coordinar_solicitud')
  })

  it('la coordinadora sobre el proceso de un asesor → cadencia completa', async () => {
    b.procesos[0].assigned_to = 'asesor-1'
    const body = await (await post(llamada('no_atendio'))).json()
    expect(body.cadencia.tareaCreada?.title).toBe('Llamada 2 a [TEST] Ana')
    expect(body.cadencia.tareasCerradas).toHaveLength(1)
  })
})

describe.each([
  ['de otro asesor', 'asesor-2'],
  ['sin asesor', null],
])('POST — asesor sobre un proceso que no es suyo (%s)', (_n, dueño) => {
  beforeEach(() => {
    b.procesos[0].assigned_to = dueño
    b.tarea({ id: 't-cadencia-otro', title: 'Llamada 2 a [TEST] Ana', assigned_to: 'coord-1', deal_id: 'd-sol', contact_id: '0000000c-0000-4000-8000-000000000001', source_activity_id: 'act-viejo' })
    como('asesor', 'asesor-1')
  })

  it('No atendió → 201, guardada con el deal_id, proceso_ajeno, sin crear ni cerrar tareas ajenas', async () => {
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.actividad.deal_id).toBe('d-sol')
    expect(body.cadencia).toMatchObject({ motivoSinTarea: 'proceso_ajeno', tareaCreada: null, tareasCerradas: [] })
    expect(pendientes().sort()).toEqual(['t-cadencia-otro', 't-entrada'])
  })

  it('volver a llamar → crea su tarea a nombre del asesor; la segunda llamada cierra solo esa', async () => {
    const r1 = await (await post(llamada('volver_a_llamar', { volver_el: { fecha: '2026-11-27', hora: '10:00' } }))).json()
    const suya = b.tareas.find((t) => t.source_activity_id === r1.actividad.id)
    expect(suya?.assigned_to).toBe('asesor-1')
    const r2 = await (await post(llamada('no_atendio', {}, TOKEN_2))).json()
    expect(r2.cadencia.tareasCerradas.map((t: { id: string }) => t.id)).toEqual([suya?.id])
    expect(pendientes().sort()).toEqual(['t-cadencia-otro', 't-entrada'])
  })
})

describe('POST — contacto sin proceso activo', () => {
  beforeEach(() => {
    b.procesos[0].stage = 'lost'
    b.tareas.length = 0
    b.tarea({ id: 't-coord-contacto', type: 'update_contact', channel: null, assigned_to: 'coord-1', contact_id: '0000000c-0000-4000-8000-000000000001' })
    b.tarea({ id: 't-asesor-contacto', title: 'Llamar a [TEST] Ana', assigned_to: 'asesor-1', contact_id: '0000000c-0000-4000-8000-000000000001' })
  })

  it('asesor → cierra solo las ligadas al contacto que están a su nombre', async () => {
    como('asesor', 'asesor-1')
    const body = await (await post(llamada('agendo'))).json()
    expect(body.actividad.deal_id).toBeNull()
    expect(body.cadencia.tareasCerradas.map((t: { id: string }) => t.id)).toEqual(['t-asesor-contacto'])
    expect(pendientes()).toEqual(['t-coord-contacto'])
  })

  it('coordinadora → las cierra todas', async () => {
    b.tareas[1].source_activity_id = 'act-del-asesor'
    const body = await (await post(llamada('agendo'))).json()
    expect(body.cadencia.tareasCerradas.map((t: { id: string }) => t.id).sort()).toEqual(['t-asesor-contacto', 't-coord-contacto'])
    expect(body.cadencia.ofrecer).toBe('coordinar_nuevo')
  })
})

describe('POST — permisos de llamadas', () => {
  it('abogado → 403 sin guardar', async () => {
    como('abogado', 'abo-1')
    expect((await post(llamada('no_atendio'))).status).toBe(403)
    expect(b.actividades).toHaveLength(0)
  })

  it('asesor sin acceso → 404 sin guardar', async () => {
    como('asesor', 'asesor-1')
    m.canAccessContact.mockResolvedValue(false)
    expect((await post(llamada('no_atendio'))).status).toBe(404)
    expect(b.actividades).toHaveLength(0)
  })
})

describe('POST — guardado repetido y fallo parcial (tarea 6.3)', () => {
  it('client_token repetido del mismo autor y contacto → 200 con la misma respuesta, sin otra fila ni otra tarea', async () => {
    const b1 = await (await post(llamada('no_atendio'))).json()
    const tareas = b.tareas.length
    const r2 = await post(llamada('no_atendio'))
    expect(r2.status).toBe(200)
    expect(await r2.json()).toEqual(b1)
    expect(b.actividades).toHaveLength(1)
    expect(b.tareas).toHaveLength(tareas)
  })

  it('mismo token y autor con OTRO resultado → 409 que lo dice, sin otra fila ni tarea', async () => {
    await post(llamada('no_atendio'))
    const tareas = b.tareas.length
    const res = await post(llamada('no_interesa'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Esa llamada ya se había guardado con otros datos. Revisá la línea de tiempo.' })
    expect(b.actividades).toHaveLength(1)
    expect(b.tareas).toHaveLength(tareas)
  })

  it('mismo token con otro comentario → 409', async () => {
    await post(llamada('no_atendio', { body: 'Dijo que vuelva' }))
    const res = await post(llamada('no_atendio', { body: 'Otra cosa' }))
    expect(res.status).toBe(409)
    expect(b.actividades[0].body).toBe('Dijo que vuelva')
  })

  it('mismo token con otra hora de volver a llamar → 409', async () => {
    await post(llamada('volver_a_llamar', { volver_el: { fecha: '2026-11-26', hora: '10:00' } }))
    const res = await post(llamada('volver_a_llamar', { volver_el: { fecha: '2026-11-26', hora: '11:00' } }))
    expect(res.status).toBe(409)
  })

  it('mismo token, llamada y después "WhatsApp enviado" → 409', async () => {
    await post(llamada('no_atendio'))
    const res = await post({ kind: 'whatsapp_sent', client_token: TOKEN })
    expect(res.status).toBe(409)
  })

  it('token de otro autor → 409 sin datos de la otra', async () => {
    await post(llamada('no_atendio', { body: 'Secreto' }))
    como('coordinador', 'coord-2')
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'No se pudo guardar. Probá de nuevo.' })
  })

  it('token usado en otro contacto → 409 sin datos', async () => {
    b.contactos.set('0000000c-0000-4000-8000-000000000002', '[TEST] Beto')
    await post(llamada('no_atendio', { body: 'Secreto' }), '0000000c-0000-4000-8000-000000000002')
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).not.toContain('Secreto')
  })

  it('token que ya usó una nota propia → 409 (no es el mismo guardado)', async () => {
    await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(409)
  })

  it('dos pedidos simultáneos con el mismo token → una fila, una tarea y las dos respuestas iguales', async () => {
    const [r1, r2] = await Promise.all([post(llamada('no_atendio')), post(llamada('no_atendio'))])
    expect([r1.status, r2.status].sort()).toEqual([200, 201])
    expect(await r1.json()).toEqual(await r2.json())
    expect(b.actividades).toHaveLength(1)
    expect(b.tareas.filter((t) => t.source_activity_id !== null)).toHaveLength(1)
  })

  it('la segunda "No atendió" con el token repetido → misma respuesta, con "Enviar WhatsApp" creada y sin motivo', async () => {
    await post(llamada('no_atendio'))
    const primera = await (await post(llamada('no_atendio', {}, TOKEN_2))).json()
    expect(primera.cadencia.tareaCreada?.title).toBe('Enviar WhatsApp a [TEST] Ana')
    const repetida = await post(llamada('no_atendio', {}, TOKEN_2))
    expect(repetida.status).toBe(200)
    const body = await repetida.json()
    expect(body).toEqual(primera)
    expect(body.cadencia.motivoSinTarea).toBeNull()
    expect(b.tareas.filter((t) => t.title.startsWith('Enviar WhatsApp'))).toHaveLength(1)
  })

  it('token repetido de una actividad ya anulada → 200 con la fila anulada, sin correr la cadencia', async () => {
    const r1 = await (await post(llamada('no_atendio'))).json()
    // "Deshacer": se anula, se descarta la tarea creada y se reabre la de entrada.
    const act = b.actividades[0]
    act.voided_at = b.ahora()
    act.voided_by = 'coord-1'
    const creada = b.tareas.find((t) => t.source_activity_id === r1.actividad.id)
    if (creada) creada.status = 'dismissed'
    const entrada = b.tareas.find((t) => t.id === 't-entrada')
    if (entrada) {
      entrada.status = 'pending'
      entrada.closed_by_activity_id = null
    }
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.actividad.voided_at).not.toBeNull()
    expect(body.cadencia).toEqual({ aplica: false, tareaCreada: null, motivoSinTarea: null, tareasCerradas: [], ofrecer: null, dealId: null })
    expect(body.pendiente).toBe(false)
    expect(pendientes()).toEqual(['t-entrada'])
  })

  it('repetición tardía de un guardado que sí agendó, con un intento posterior → aplica verdadero con su tarea, sin crear ni cerrar nada', async () => {
    const r1 = await (await post(llamada('no_atendio'))).json()
    await post(llamada('no_atendio', {}, TOKEN_2))
    const antes = JSON.stringify(b.tareas)
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cadencia.aplica).toBe(true)
    expect(body.cadencia.tareaCreada?.id).toBe(r1.cadencia.tareaCreada.id)
    expect(body.cadencia.motivoSinTarea).toBeNull()
    expect(JSON.stringify(b.tareas)).toBe(antes)
  })

  it('crear la tarea falla una vez → se reintenta y responde 201 con pendiente falso', async () => {
    b.fallarCrear = 1
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(201)
    expect((await res.json()).pendiente).toBe(false)
  })

  it('crear la tarea falla tras el reintento → 201 con pendiente verdadero y la llamada guardada', async () => {
    b.fallarCrear = 2
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.pendiente).toBe(true)
    expect(body.cadencia.tareaCreada).toBeNull()
    expect(body.cadencia.tareasCerradas).toHaveLength(1) // cerrar sí funcionó
    expect(b.actividades).toHaveLength(1)
    err.mockRestore()
  })

  it('cerrar tareas falla tras el reintento → 201 con pendiente verdadero', async () => {
    b.fallarCerrar = 2
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post(llamada('no_atendio'))
    expect(res.status).toBe(201)
    expect((await res.json()).pendiente).toBe(true)
    err.mockRestore()
  })
})

