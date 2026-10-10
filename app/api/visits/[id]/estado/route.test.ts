import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { estado, datosMock, avanzarMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: { leerVisita: vi.fn(), actualizarVisita: vi.fn(), eventosDeLaVisita: vi.fn(), asesorAsignable: vi.fn() },
  avanzarMock: vi.fn(),
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/leads/pipeline-state', () => ({ advancePipelineState: avanzarMock }))

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

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset()); avanzarMock.mockReset()
  estado.role = 'asesor'; estado.id = '22222222-2222-4222-8222-222222222222'
  datosMock.leerVisita.mockResolvedValue(visita())
  datosMock.actualizarVisita.mockResolvedValue({ ok: true })
  datosMock.eventosDeLaVisita.mockResolvedValue([])
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
  })
  it('si la pantalla manda la versión que vio, se usa esa', async () => {
    const versionDeLaPantalla = '2098-05-05T12:00:00.000000+00:00'
    const res = await pedir({ tipo: 'realizada', interes: 'alto', version: versionDeLaPantalla })
    expect(res.status).toBe(200)
    expect(datosMock.actualizarVisita).toHaveBeenCalledWith(VISITA, versionDeLaPantalla,
      { status: 'completed', advisor_interest: 'alto', completion_notes: null, outcome_reason: null }, estado.id)
  })
  it('una acción que no corresponde al estado: 409 ACCION_NO_VALIDA', async () => {
    const res = await pedir({ tipo: 'confirmar' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'ACCION_NO_VALIDA', error: 'Esta visita ya no se puede confirmar' })
  })
  it('si otra persona la cambió en el medio: 409 CAMBIO_CONCURRENTE', async () => {
    datosMock.actualizarVisita.mockResolvedValue({ ok: false, motivo: 'cambio_concurrente' })
    const res = await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'CAMBIO_CONCURRENTE', error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.' })
  })
  it('un asesor no toca la visita de otro: 403', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    expect((await pedir({ tipo: 'realizada' })).status).toBe(403)
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
    expect((await pedir({ tipo: 'realizada' })).status).toBe(404)
  })
})
