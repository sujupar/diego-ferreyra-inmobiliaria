import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, todasMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  todasMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@/lib/visitas/datos', () => ({ todasLasVisitas: todasMock }))

import { GET } from './route'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const ASESOR = '22222222-2222-4222-8222-222222222222'
const pedir = (qs: string) => GET(new NextRequest(`http://local/api/visits/resumen?${qs}`))
const PERIODO = 'desde=2026-09-16&hasta=2026-10-15'

beforeEach(() => {
  todasMock.mockReset()
  todasMock.mockResolvedValue({ filas: [], truncado: false })
  estado.role = 'coordinador'; estado.id = '11111111-1111-4111-8111-111111111111'; estado.logueado = true; estado.activo = true
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('GET /api/visits/resumen', () => {
  it('sin sesión 401; abogado 403; ninguno toca la base', async () => {
    estado.logueado = false
    expect((await pedir(PERIODO)).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await pedir(PERIODO)).status).toBe(403)
    expect(todasMock).not.toHaveBeenCalled()
  })
  it('sin período: 400 en castellano', async () => {
    const res = await pedir('')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Elegí las dos fechas del período')
  })
  it('lee el período en días argentinos, las activas y los próximos 7 días, con el mismo alcance', async () => {
    await pedir(`${PERIODO}&origen=portal&asesor=${ASESOR}`)
    const [periodo, abiertas, proximas] = todasMock.mock.calls.map(c => c[0])
    expect(periodo).toMatchObject({ alcance: { tipo: 'todo' }, asesorId: ASESOR, origen: 'portal',
      desde: '2026-09-16T00:00:00.000-03:00', hasta: '2026-10-15T23:59:59.999999-03:00' })
    expect(abiertas).toMatchObject({ estados: ['pending_confirmation', 'scheduled'], asesorId: ASESOR })
    expect(abiertas.desde).toBeUndefined()
    expect(proximas).toMatchObject({ desde: '2026-10-15T00:00:00.000-03:00', hasta: '2026-10-21T23:59:59.999999-03:00' })
  })
  it('asesor: alcance propio, su ?asesor= no cuenta, y "por asesor" vacío', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    todasMock.mockResolvedValue({ filas: [v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' })], truncado: false })
    const res = await pedir(`${PERIODO}&asesor=77777777-7777-4777-8777-777777777777`)
    expect(todasMock.mock.calls[0][0]).toMatchObject({ alcance: { tipo: 'propio', usuarioId: ASESOR }, asesorId: null })
    const { data } = await res.json()
    expect(data.metricas.porAsesor).toEqual([])
    expect(data.metricas.agendadas.valor).toBe(1)
  })
  it('período sin visitas: las cifras dicen sin datos (valor null), no 0', async () => {
    const { data } = await (await pedir(PERIODO)).json()
    expect(data.metricas.agendadas).toEqual({ valor: null, base: 0, orientativo: false })
    expect(data.metricas.realizadas.valor).toBeNull()
    expect(data.agenda).toEqual([{ fecha: '2026-10-15', etiqueta: 'Hoy', visitas: [] }])
  })
  it('si alguna lectura llegó al techo, avisa truncado', async () => {
    todasMock.mockResolvedValueOnce({ filas: [], truncado: true })
    const { data } = await (await pedir(PERIODO)).json()
    expect(data.truncado).toBe(true)
  })
  it('un fallo de la base: 500 en castellano', async () => {
    todasMock.mockRejectedValue(new Error('listar visitas: boom'))
    const res = await pedir(PERIODO)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos cargar el resumen de visitas')
  })
})
