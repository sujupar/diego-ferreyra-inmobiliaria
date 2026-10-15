import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { estado, datosMock, avanzarMock, resolverFallbackMock, servicioMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: { leerVisita: vi.fn(), actualizarVisita: vi.fn(), eventosDeLaVisita: vi.fn(), asesorAsignable: vi.fn() },
  avanzarMock: vi.fn(),
  resolverFallbackMock: vi.fn(),
  servicioMock: { prepararYEnviarEncuesta: vi.fn(), encuestaParaFichaSegura: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/leads/pipeline-state', () => ({ advancePipelineState: avanzarMock }))
vi.mock('@/lib/leads/resolve-crm-visit-lead', () => ({ resolveLeadIdForVisitWithFallback: resolverFallbackMock }))
vi.mock('@/lib/visitas/encuesta/servicio', () => servicioMock)

import { POST } from './route'

const VISITA = '66666666-6666-4666-8666-666666666666'
// Versión LEÍDA por el mock de `leerVisita`: deliberadamente distinta de
// cualquier valor de `status` ('scheduled', etc.) para que un test que
// confunda "versión" con "estado" (como hacía el borrador original del
// brief) falle de forma ruidosa en vez de pasar por casualidad.
const VERSION_LEIDA = '2099-01-01T00:00:00.000000+00:00'
const visita = (p: Record<string, unknown> = {}) => ({
  id: VISITA, status: 'scheduled', scheduled_at: '2099-01-09T20:00:00Z', advisor_id: estado.id, created_by: estado.id,
  lead_id: '55555555-5555-4555-8555-555555555555', updated_at: VERSION_LEIDA, ...p,
})
function pedir(body: unknown) {
  return POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id: VISITA }) })
}

const ENCUESTA_FICHA = {
  link: 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y', estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' },
  puedeReenviar: false, vencida: false, venceEl: '2099-02-09T15:00:00.000Z', respondidaEl: null, respuestas: null, eventos: [],
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset()); avanzarMock.mockReset(); resolverFallbackMock.mockReset()
  servicioMock.prepararYEnviarEncuesta.mockReset().mockResolvedValue(ENCUESTA_FICHA)
  servicioMock.encuestaParaFichaSegura.mockReset().mockResolvedValue(null)
  estado.role = 'asesor'; estado.id = '22222222-2222-4222-8222-222222222222'
  datosMock.leerVisita.mockResolvedValue(visita())
  datosMock.actualizarVisita.mockResolvedValue({ ok: true })
  datosMock.eventosDeLaVisita.mockResolvedValue([])
  resolverFallbackMock.mockResolvedValue(null)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-10T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('POST /api/visits/[id]/estado', () => {
  it('marca "Se realizó", con el autor, y avanza al comprador a "visitó"', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(res.status).toBe(200)
    expect(datosMock.actualizarVisita).toHaveBeenCalledWith(VISITA, VERSION_LEIDA,
      { status: 'completed', advisor_interest: 'alto', completion_notes: null, outcome_reason: null }, estado.id)
    expect(avanzarMock).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555', 'visit_completed')
    expect(resolverFallbackMock).not.toHaveBeenCalled()
  })
  it('realizada SIN lead_id: usa el fallback de resolve-crm-visit-lead', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ lead_id: null }))
    resolverFallbackMock.mockResolvedValue('99999999-9999-4999-8999-999999999999')
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(res.status).toBe(200)
    expect(resolverFallbackMock).toHaveBeenCalledWith(VISITA)
    expect(avanzarMock).toHaveBeenCalledWith('99999999-9999-4999-8999-999999999999', 'visit_completed')
  })
  it('no_realizada: no se avanza al comprador', async () => {
    const res = await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(res.status).toBe(200)
    expect(avanzarMock).not.toHaveBeenCalled()
    expect(resolverFallbackMock).not.toHaveBeenCalled()
  })
  it('si avancePipelineState lanza, la respuesta sigue siendo 200', async () => {
    avanzarMock.mockRejectedValue(new Error('boom'))
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(res.status).toBe(200)
  })
  it('version con el formato real de Postgres: coincide con la leída, sigue adelante', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto', version: VERSION_LEIDA })
    expect(res.status).toBe(200)
    expect(datosMock.actualizarVisita).toHaveBeenCalledWith(VISITA, VERSION_LEIDA,
      { status: 'completed', advisor_interest: 'alto', completion_notes: null, outcome_reason: null }, estado.id)
  })
  it('version que NO coincide con la leída: 409 CAMBIO_CONCURRENTE antes de escribir', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto', version: '2098-05-05T12:00:00.000000+00:00' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'CAMBIO_CONCURRENTE' })
    expect(datosMock.actualizarVisita).not.toHaveBeenCalled()
  })
  it('version con formato inválido: 400 "Versión inválida"', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto', version: 'no-es-una-fecha' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Versión inválida' })
    expect(datosMock.leerVisita).not.toHaveBeenCalled()
  })
  it('una acción que no corresponde al estado: 409 ACCION_NO_VALIDA', async () => {
    const res = await pedir({ tipo: 'confirmar' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'ACCION_NO_VALIDA', error: 'Esta visita ya no se puede confirmar' })
  })
  it('si otra persona la cambió en el medio (entre leer y escribir): 409 CAMBIO_CONCURRENTE', async () => {
    datosMock.actualizarVisita.mockResolvedValue({ ok: false, motivo: 'cambio_concurrente' })
    const res = await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'CAMBIO_CONCURRENTE', error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.' })
  })
  it('si escribe bien pero la relectura falla: 200 con data null (no 500)', async () => {
    datosMock.eventosDeLaVisita.mockRejectedValue(new Error('boom'))
    const res = await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: null })
  })
  it('un abogado: 403 sin leer nada', async () => {
    estado.role = 'abogado'
    expect((await pedir({ tipo: 'realizada', interes: 'alto' })).status).toBe(403)
    expect(datosMock.leerVisita).not.toHaveBeenCalled()
  })
  it('una visita ajena: 404, no 403', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'No encontramos la visita' })
  })
  it('un asesor no puede cambiar el asesor: 403', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ scheduled_at: '2099-01-20T20:00:00Z' }))
    expect((await pedir({ tipo: 'cambiar_asesor', asesorId: '77777777-7777-4777-8777-777777777777' })).status).toBe(403)
  })
  it('coordinador cambia el asesor solo a uno activo', async () => {
    estado.role = 'coordinador'
    datosMock.leerVisita.mockResolvedValue(visita({ scheduled_at: '2099-01-20T20:00:00Z' }))
    datosMock.asesorAsignable.mockResolvedValue(false)
    expect((await pedir({ tipo: 'cambiar_asesor', asesorId: '77777777-7777-4777-8777-777777777777' })).status).toBe(400)
  })
  it('visita inexistente: 404; cuerpo inválido: 400', async () => {
    expect((await pedir({ tipo: 'bailar' })).status).toBe(400)
    datosMock.leerVisita.mockResolvedValue(null)
    expect((await pedir({ tipo: 'realizada', interes: 'alto' })).status).toBe(404)
  })
  it('"Se realizó" sin el interés: 400 y no escribe nada (spec §3.3)', async () => {
    const res = await pedir({ tipo: 'realizada', notas: 'Le gustó' })
    expect(res.status).toBe(400)
    expect(datosMock.actualizarVisita).not.toHaveBeenCalled()
    expect((await pedir({ tipo: 'realizada', interes: null })).status).toBe(400)
    expect(datosMock.actualizarVisita).not.toHaveBeenCalled()
  })
  it('"Se realizó" crea la encuesta con el autor y la devuelve', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(servicioMock.prepararYEnviarEncuesta).toHaveBeenCalledWith(VISITA, { reenvio: false, actorId: estado.id, ahora: expect.any(Date) })
    expect((await res.json()).data.encuesta).toEqual(ENCUESTA_FICHA)
  })
  it('si la encuesta falla, la visita queda realizada igual (200) y la ficha la relee', async () => {
    servicioMock.prepararYEnviarEncuesta.mockRejectedValue(new Error('boom'))
    const res = await pedir({ tipo: 'realizada', interes: 'medio' })
    expect(res.status).toBe(200)
    expect(datosMock.actualizarVisita).toHaveBeenCalled()
    expect(servicioMock.encuestaParaFichaSegura).toHaveBeenCalledWith(VISITA, expect.any(Date))
  })
  it('"No se realizó" no crea encuesta', async () => {
    await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(servicioMock.prepararYEnviarEncuesta).not.toHaveBeenCalled()
  })
})
