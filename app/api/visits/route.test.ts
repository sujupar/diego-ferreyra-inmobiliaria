import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { estado, datosMock, avanzarMock, emailMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  datosMock: {
    leerPropiedadParaVisita: vi.fn(), leerConsulta: vi.fn(), leerRegistro: vi.fn(),
    asegurarComprador: vi.fn(), completarTelefonoDelRegistro: vi.fn(), visitasActivasDeLaPropiedad: vi.fn(),
    insertarVisita: vi.fn(), asesorAsignable: vi.fn(),
  },
  avanzarMock: vi.fn(),
  emailMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/leads/pipeline-state', () => ({ advancePipelineState: avanzarMock }))
vi.mock('@/lib/email/notifications/visit-scheduled-client', () => ({ sendVisitScheduledToClient: emailMock }))
vi.mock('@/lib/supabase/visits', () => ({ listVisits: vi.fn(async () => []) }))

import { POST } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const ASESOR = '22222222-2222-4222-8222-222222222222'
const CONSULTA = '44444444-4444-4444-8444-444444444444'

const propiedad = { id: PROP, address: 'Doblas 248', neighborhood: 'Caballito', status: 'approved',
  commercial_status: 'disponible', assigned_to: ASESOR, foto: null, asking_price: 220000, currency: 'USD' }

function pedir(body: unknown) {
  return POST(new Request('http://local/api/visits', { method: 'POST', body: JSON.stringify(body) }) as never)
}

const base = {
  propiedadId: PROP, origen: 'cartel', persona: { tipo: 'nueva', nombre: 'Sofía Benítez', telefono: '11 5823-4521' },
  fecha: '2099-01-12', hora: '11:00', asesorId: ASESOR, confirmada: true,
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  avanzarMock.mockReset(); emailMock.mockReset()
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
  it('una consulta solo vale con origen portal', async () => {
    expect((await pedir({ ...base, origen: 'cartel', persona: { tipo: 'consulta', id: CONSULTA } })).status).toBe(400)
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
  it('con forzarDuplicado sí crea', async () => {
    datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([{ id: 'v1', lead_id: '55555555-5555-4555-8555-555555555555',
      client_phone: null, scheduled_at: '2099-01-12T14:00:00Z', status: 'scheduled' }])
    expect((await pedir({ ...base, forzarDuplicado: true })).status).toBe(201)
  })
  it('origen "otro" sin escribir cuál: 400', async () => {
    const res = await pedir({ ...base, origen: 'otro' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Escribí de dónde vino la visita')
  })
  it('horario fuera de rango: 400 con el mensaje del horario', async () => {
    const res = await pedir({ ...base, fecha: '2098-01-01' })
    expect((await res.json()).error).toBe('Solo se pueden registrar visitas de los últimos 60 días')
  })
  it('asesor inexistente o dado de baja: 400', async () => {
    datosMock.asesorAsignable.mockResolvedValue(false)
    expect((await pedir(base)).status).toBe(400)
  })
  it('manda el email de confirmación solo si está confirmada y hay email', async () => {
    await pedir({ ...base, persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).toHaveBeenCalledTimes(1)
    emailMock.mockReset()
    await pedir({ ...base, confirmada: false, persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).not.toHaveBeenCalled()
  })
  it('un fallo de la base responde 500 con mensaje en castellano', async () => {
    datosMock.insertarVisita.mockRejectedValue(new Error('crear visita: boom'))
    const res = await pedir(base)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos agendar la visita. Probá de nuevo.')
  })
})
