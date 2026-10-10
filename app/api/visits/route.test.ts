import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, datosMock, avanzarMock, emailMock, listVisitsMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  datosMock: {
    leerPropiedadParaVisita: vi.fn(), leerConsulta: vi.fn(), leerRegistro: vi.fn(),
    asegurarComprador: vi.fn(), completarTelefonoDelRegistro: vi.fn(), visitasActivasDeLaPropiedad: vi.fn(),
    insertarVisita: vi.fn(), asesorAsignable: vi.fn(), marcarCompradorAgendado: vi.fn(),
  },
  avanzarMock: vi.fn(),
  emailMock: vi.fn(),
  listVisitsMock: vi.fn(async () => []),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/leads/pipeline-state', () => ({ advancePipelineState: avanzarMock }))
vi.mock('@/lib/email/notifications/visit-scheduled-client', () => ({ sendVisitScheduledToClient: emailMock }))
vi.mock('@/lib/supabase/visits', () => ({ listVisits: listVisitsMock }))

import { POST, GET } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const ASESOR = '22222222-2222-4222-8222-222222222222'
const CONSULTA = '44444444-4444-4444-8444-444444444444'
const REGISTRO = '88888888-8888-4888-8888-888888888888'

const propiedad = { id: PROP, address: 'Doblas 248', neighborhood: 'Caballito', status: 'approved',
  commercial_status: 'disponible', assigned_to: ASESOR, foto: null, asking_price: 220000, currency: 'USD' }

function pedir(body: unknown) {
  return POST(new Request('http://local/api/visits', { method: 'POST', body: JSON.stringify(body) }) as never)
}

function pedirLista(qs = '') {
  return GET(new NextRequest(`http://local/api/visits${qs ? `?${qs}` : ''}`))
}

const base = {
  propiedadId: PROP, origen: 'cartel', persona: { tipo: 'nueva', nombre: 'Sofía Benítez', telefono: '11 5823-4521' },
  fecha: '2099-01-12', hora: '11:00', asesorId: ASESOR, confirmada: true,
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  avanzarMock.mockReset(); emailMock.mockReset(); listVisitsMock.mockReset()
  listVisitsMock.mockResolvedValue([])
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  estado.id = '11111111-1111-4111-8111-111111111111'
  datosMock.leerPropiedadParaVisita.mockResolvedValue(propiedad)
  datosMock.asegurarComprador.mockResolvedValue('55555555-5555-4555-8555-555555555555')
  datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([])
  datosMock.insertarVisita.mockResolvedValue('66666666-6666-4666-8666-666666666666')
  datosMock.asesorAsignable.mockResolvedValue(true)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-10T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('POST /api/visits', () => {
  it('sin sesión 401; abogado 403', async () => {
    estado.logueado = false
    expect((await pedir(base)).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await pedir(base)).status).toBe(403)
  })
  it('usuario inactivo: 401', async () => {
    estado.activo = false
    expect((await pedir(base)).status).toBe(401)
  })
  it('agenda una persona nueva por cartel, confirmada, a la hora argentina', async () => {
    const res = await pedir(base)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: '66666666-6666-4666-8666-666666666666' } })
    const fila = datosMock.insertarVisita.mock.calls[0][0]
    // El teléfono '11 5823-4521' se guarda en formato canónico E.164
    // (telefonoCanonico, lib/visitas/persona.ts) — verificado contra la
    // función real de lib/integrations/whatsapp/phone.ts, no mockeada.
    expect(fila).toMatchObject({
      property_id: PROP, advisor_id: ASESOR, client_name: 'Sofía Benítez', client_phone: '+5491158234521',
      scheduled_at: '2099-01-12T14:00:00.000Z', status: 'scheduled', origin: 'cartel', origin_detail: null,
      lead_id: '55555555-5555-4555-8555-555555555555', portal_inquiry_id: null,
      created_by: estado.id, changed_by: estado.id,
    })
    expect(datosMock.asegurarComprador.mock.calls[0][0]).toMatchObject({ source: 'visita:cartel', propertyId: PROP })
    expect(avanzarMock).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555', 'visit_scheduled')
  })
  it('un celular escrito con "15" queda guardado en el mismo formato que sin el "15"', async () => {
    await pedir({ ...base, persona: { ...base.persona, telefono: '011 15 5823-4521' } })
    const conQuince = datosMock.insertarVisita.mock.calls[0][0].client_phone
    datosMock.insertarVisita.mockClear()
    await pedir({ ...base, persona: { ...base.persona, telefono: '11 5823-4521' } })
    const sinQuince = datosMock.insertarVisita.mock.calls[0][0].client_phone
    expect(conQuince).toBe(sinQuince)
    expect(conQuince).toBe('+5491158234521')
  })
  it('un asesor queda a su nombre aunque pida otro', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    await pedir({ ...base, asesorId: '77777777-7777-4777-8777-777777777777' })
    expect(datosMock.insertarVisita.mock.calls[0][0].advisor_id).toBe(ASESOR)
  })
  it('un asesor no agenda en una propiedad que no es suya', async () => {
    estado.role = 'asesor'; estado.id = '77777777-7777-4777-8777-777777777777'
    expect((await pedir(base)).status).toBe(403)
  })
  it('consulta de portal: usa los datos de la consulta y la vincula', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: PROP, lead_name: 'Mariana López',
      lead_phone: '1158234521', lead_email: null, portal: 'zonaprop', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: 'Hola' })
    const res = await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })
    expect(res.status).toBe(201)
    expect(datosMock.insertarVisita.mock.calls[0][0]).toMatchObject({
      origin: 'portal', origin_detail: 'zonaprop', portal_inquiry_id: CONSULTA, client_name: 'Mariana López' })
    expect(datosMock.asegurarComprador.mock.calls[0][0]).toMatchObject({ source: 'portal:zonaprop' })
  })
  it('consulta de OTRA propiedad: 400', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: 'otra', lead_name: 'X', lead_phone: '1158234521',
      lead_email: null, portal: 'zonaprop', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: null })
    expect((await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })).status).toBe(400)
  })
  it('consulta sin teléfono y sin completar: 400 con mensaje', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: PROP, lead_name: 'X', lead_phone: null,
      lead_email: null, portal: 'mercadolibre', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: null })
    const res = await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Falta el teléfono de la persona')
  })
  it('consulta: el teléfono GUARDADO gana aunque llegue uno distinto del navegador', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: PROP, lead_name: 'Mariana López',
      lead_phone: '+5491144444444', lead_email: null, portal: 'zonaprop', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: null })
    const res = await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA, telefono: '11 9999-9999' } })
    expect(res.status).toBe(201)
    expect(datosMock.insertarVisita.mock.calls[0][0].client_phone).toBe('+5491144444444')
  })
  it('una consulta solo vale con origen portal', async () => {
    expect((await pedir({ ...base, origen: 'cartel', persona: { tipo: 'consulta', id: CONSULTA } })).status).toBe(400)
  })
  it('registro: el teléfono GUARDADO gana aunque llegue uno distinto, y no reescribe', async () => {
    datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: PROP, name: 'Lucas Paz',
      phone: '+5491144444444', email: null, source: 'landing', utm: null, created_at: '2099-01-01T00:00:00Z',
      suspected_bot: false, deleted_at: null })
    const res = await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO, telefono: '11 9999-9999' } })
    expect(res.status).toBe(201)
    expect(datosMock.insertarVisita.mock.calls[0][0]).toMatchObject({ client_phone: '+5491144444444', lead_id: REGISTRO })
    expect(datosMock.completarTelefonoDelRegistro).not.toHaveBeenCalled()
  })
  it('registro sin teléfono guardado: completa con el que manda el navegador, en formato canónico', async () => {
    datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: PROP, name: 'Lucas Paz', phone: null,
      email: null, source: null, utm: null, created_at: '2099-01-01T00:00:00Z', suspected_bot: false, deleted_at: null })
    const res = await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO, telefono: '11 5823-4521' } })
    expect(res.status).toBe(201)
    expect(datosMock.completarTelefonoDelRegistro).toHaveBeenCalledWith(REGISTRO, '+5491158234521')
    expect(datosMock.insertarVisita.mock.calls[0][0]).toMatchObject({ client_phone: '+5491158234521', lead_id: REGISTRO })
  })
  it('registro con un teléfono guardado INVÁLIDO (no nulo): la visita usa el del navegador, pero el registro no se pisa', async () => {
    // Solo se completan huecos (misma regla que decidirComprador): un dato que ya
    // existe —aunque esté mal— no se reescribe desde la ventana de agendar.
    datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: PROP, name: 'Lucas Paz', phone: '123',
      email: null, source: null, utm: null, created_at: '2099-01-01T00:00:00Z', suspected_bot: false, deleted_at: null })
    const res = await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO, telefono: '11 5823-4521' } })
    expect(res.status).toBe(201)
    expect(datosMock.insertarVisita.mock.calls[0][0]).toMatchObject({ client_phone: '+5491158234521', lead_id: REGISTRO })
    expect(datosMock.completarTelefonoDelRegistro).not.toHaveBeenCalled()
  })
  it('registro de OTRA propiedad: 400', async () => {
    datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: 'otra', name: 'X', phone: '1158234521',
      email: null, source: null, utm: null, created_at: '2099-01-01T00:00:00Z', suspected_bot: false, deleted_at: null })
    expect((await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO } })).status).toBe(400)
  })
  it('registro en la papelera (deleted_at): 400', async () => {
    datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: PROP, name: 'X', phone: '1158234521',
      email: null, source: null, utm: null, created_at: '2099-01-01T00:00:00Z', suspected_bot: false, deleted_at: '2099-01-02T00:00:00Z' })
    expect((await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO } })).status).toBe(400)
  })
  it('propiedad vendida: 409 PROPIEDAD_NO_DISPONIBLE', async () => {
    datosMock.leerPropiedadParaVisita.mockResolvedValue({ ...propiedad, commercial_status: 'vendida' })
    const res = await pedir(base)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('PROPIEDAD_NO_DISPONIBLE')
  })
  it('doble toque: si la persona ya tiene visita activa, 409 VISITA_DUPLICADA y no crea', async () => {
    datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([{ id: 'v1', lead_id: '55555555-5555-4555-8555-555555555555',
      client_phone: '+5491158234521', scheduled_at: '2099-01-12T14:00:00Z', status: 'scheduled' }])
    const res = await pedir(base)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'VISITA_DUPLICADA', visita: { id: 'v1' } })
    expect(datosMock.insertarVisita).not.toHaveBeenCalled()
  })
  it('doble toque: el teléfono guardado en OTRO formato ("15") también se detecta, con lead_id distinto', async () => {
    datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([{ id: 'v1', lead_id: 'otro-lead-no-relacionado',
      client_phone: '011 15 5823-4521', scheduled_at: '2099-01-12T14:00:00Z', status: 'scheduled' }])
    const res = await pedir(base) // persona nueva, teléfono '11 5823-4521' → canónico '+5491158234521'
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('VISITA_DUPLICADA')
  })
  it('con forzarDuplicado sí crea', async () => {
    datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([{ id: 'v1', lead_id: '55555555-5555-4555-8555-555555555555',
      client_phone: null, scheduled_at: '2099-01-12T14:00:00Z', status: 'scheduled' }])
    expect((await pedir({ ...base, forzarDuplicado: true })).status).toBe(201)
  })
  it('origen "otro" sin escribir cuál: 400, y no llega a crear/tocar el comprador', async () => {
    const res = await pedir({ ...base, origen: 'otro' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Escribí de dónde vino la visita')
    expect(datosMock.asegurarComprador).not.toHaveBeenCalled()
  })
  it('horario fuera de rango: 400 con el mensaje del horario', async () => {
    const res = await pedir({ ...base, fecha: '2098-01-01' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Solo se pueden registrar visitas de los últimos 60 días')
  })
  it('coordinador sin asesorId: 400', async () => {
    const sinAsesor: Record<string, unknown> = { ...base }
    delete sinAsesor.asesorId
    expect((await pedir(sinAsesor)).status).toBe(400)
  })
  it('asesor inexistente o dado de baja: 400', async () => {
    datosMock.asesorAsignable.mockResolvedValue(false)
    expect((await pedir(base)).status).toBe(400)
  })
  it('coordinador que se elige a sí mismo también se valida contra asesorAsignable', async () => {
    datosMock.asesorAsignable.mockResolvedValue(false)
    const res = await pedir({ ...base, asesorId: estado.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Esa persona no puede mostrar propiedades (tiene que ser asesor o dueño activo)')
    expect(datosMock.asesorAsignable).toHaveBeenCalledWith(estado.id)
  })
  it('manda el email de confirmación solo si está confirmada y hay email', async () => {
    await pedir({ ...base, persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).toHaveBeenCalledTimes(1)
    emailMock.mockReset()
    await pedir({ ...base, confirmada: false, persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).not.toHaveBeenCalled()
  })
  it('una visita que YA PASÓ no manda "tu visita está confirmada", aunque esté confirmada y haya email', async () => {
    // Reloj: 2099-01-10T15:00Z = 12:00 en Argentina. Registrar hoy la visita de ayer.
    const res = await pedir({ ...base, fecha: '2099-01-09', persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(res.status).toBe(201)
    expect(datosMock.insertarVisita).toHaveBeenCalledTimes(1)
    expect(emailMock).not.toHaveBeenCalled()
  })
  it('hoy pero más temprano que ahora también ya pasó: no manda el email', async () => {
    await pedir({ ...base, fecha: '2099-01-10', hora: '11:00', persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).not.toHaveBeenCalled()
  })
  it('hoy pero más tarde que ahora es futura: sí manda el email', async () => {
    await pedir({ ...base, fecha: '2099-01-10', hora: '13:00', persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).toHaveBeenCalledTimes(1)
  })
  it('el comprador de una persona nueva se crea/reusa como "scheduled" (no suma como consulta sin responder)', async () => {
    await pedir(base)
    expect(datosMock.asegurarComprador.mock.calls[0][0]).toMatchObject({ estado: 'scheduled' })
  })
  it('el comprador de una consulta de portal también queda "scheduled"', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: PROP, lead_name: 'Mariana López',
      lead_phone: '1158234521', lead_email: null, portal: 'zonaprop', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: 'Hola' })
    await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })
    expect(datosMock.asegurarComprador.mock.calls[0][0]).toMatchObject({ estado: 'scheduled' })
  })
  it('registro ya existente: una vez creada la visita, se marca agendado (de "new" a "scheduled")', async () => {
    datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: PROP, name: 'Lucas Paz',
      phone: '+5491144444444', email: null, source: 'landing', utm: null, created_at: '2099-01-01T00:00:00Z',
      suspected_bot: false, deleted_at: null })
    const res = await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO } })
    expect(res.status).toBe(201)
    expect(datosMock.marcarCompradorAgendado).toHaveBeenCalledWith(REGISTRO)
    expect(datosMock.asegurarComprador).not.toHaveBeenCalled()
  })
  it('registro: si marcarlo agendado falla, la visita igual quedó (201) y se registra el error', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      datosMock.leerRegistro.mockResolvedValue({ id: REGISTRO, property_id: PROP, name: 'Lucas Paz',
        phone: '+5491144444444', email: null, source: 'landing', utm: null, created_at: '2099-01-01T00:00:00Z',
        suspected_bot: false, deleted_at: null })
      datosMock.marcarCompradorAgendado.mockRejectedValue(new Error('marcar comprador como agendado: boom'))
      const res = await pedir({ ...base, persona: { tipo: 'registro', id: REGISTRO } })
      expect(res.status).toBe(201)
      expect(errores).toHaveBeenCalled()
    } finally { errores.mockRestore() }
  })
  it('un fallo de la base responde 500 con mensaje en castellano', async () => {
    datosMock.insertarVisita.mockRejectedValue(new Error('crear visita: boom'))
    const res = await pedir(base)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos agendar la visita. Probá de nuevo.')
  })
})

describe('GET /api/visits', () => {
  it('sin sesión 401; abogado 403', async () => {
    estado.logueado = false
    expect((await pedirLista()).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await pedirLista()).status).toBe(403)
  })
  it('un asesor que pide el advisor_id de otro queda forzado al suyo', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    await pedirLista(`advisor_id=${'77777777-7777-4777-8777-777777777777'}`)
    expect(listVisitsMock.mock.calls[0][0]).toMatchObject({ advisorId: ASESOR })
  })
  it('un coordinador puede pedir el advisor_id de otro: se respeta', async () => {
    await pedirLista(`advisor_id=${ASESOR}`)
    expect(listVisitsMock.mock.calls[0][0]).toMatchObject({ advisorId: ASESOR })
  })
})
