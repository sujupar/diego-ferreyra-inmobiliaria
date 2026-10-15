import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock, servicioMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: { leerVisita: vi.fn(), eventosDeLaVisita: vi.fn() },
  servicioMock: { encuestaParaFichaSegura: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/visitas/encuesta/servicio', () => servicioMock)

import { GET } from './route'

const VISITA = '66666666-6666-4666-8666-666666666666'
const visita = (p: Record<string, unknown> = {}) => ({
  id: VISITA, status: 'scheduled', scheduled_at: '2099-01-20T20:00:00Z', advisor_id: estado.id, created_by: estado.id,
  lead_id: null, updated_at: '2099-01-01T00:00:00.000000+00:00', ...p,
})
function pedir(id: string) {
  return GET(new Request('http://local') as never, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  servicioMock.encuestaParaFichaSegura.mockReset().mockResolvedValue(null)
  estado.role = 'asesor'; estado.id = '22222222-2222-4222-8222-222222222222'
  datosMock.leerVisita.mockResolvedValue(visita())
  datosMock.eventosDeLaVisita.mockResolvedValue([])
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-10T15:00:00Z'))
})

describe('GET /api/visits/[id]', () => {
  it('id que no es UUID: 404', async () => {
    const res = await pedir('no-es-un-uuid')
    expect(res.status).toBe(404)
    expect(datosMock.leerVisita).not.toHaveBeenCalled()
  })
  it('una visita ajena para un asesor: 404', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    expect((await pedir(VISITA)).status).toBe(404)
  })
  it('un abogado: 404 (no gestiona visitas)', async () => {
    estado.role = 'abogado'
    expect((await pedir(VISITA)).status).toBe(404)
  })
  it('la propia: 200, sin "cambiar_asesor" en las acciones para un asesor', async () => {
    const res = await pedir(VISITA)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.acciones).not.toContain('cambiar_asesor')
    expect(body.data.acciones).toContain('reprogramar')
  })
  it('la misma visita: 200 y CON "cambiar_asesor" para un coordinador', async () => {
    estado.role = 'coordinador'
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    const res = await pedir(VISITA)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.acciones).toContain('cambiar_asesor')
  })
  it('suma la encuesta y sus eventos ordenados en el historial', async () => {
    servicioMock.encuestaParaFichaSegura.mockResolvedValue({
      link: 'x', estado: { clave: 'enviada', texto: 'Enviada' }, puedeReenviar: false, vencida: false, venceEl: '2099-02-09T00:00:00Z',
      respondidaEl: null, respuestas: null,
      eventos: [{ id: 'encuesta-enviada-1', kind: 'encuesta_enviada', created_at: '2099-01-02T00:00:00Z', from_status: null, to_status: null,
        from_scheduled_at: null, to_scheduled_at: null, reason: null, note: null, actor: null, desde_asesor: null, hacia_asesor: null }],
    })
    datosMock.eventosDeLaVisita.mockResolvedValue([{ id: 'e1', kind: 'creada', created_at: '2099-01-01T00:00:00Z', from_status: null, to_status: null,
      from_scheduled_at: null, to_scheduled_at: null, reason: null, note: null, actor: 'Lucas', desde_asesor: null, hacia_asesor: null }])
    const body = await (await pedir(VISITA)).json()
    expect(body.data.encuesta.estado.texto).toBe('Enviada')
    expect(body.data.eventos.map((e: { kind: string }) => e.kind)).toEqual(['creada', 'encuesta_enviada'])
  })
})
