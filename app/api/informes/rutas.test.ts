import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth, datosMock, servicioMock } = vi.hoisted(() => ({
  auth: { r: { ok: true, userId: 'u1', rol: 'coordinador' } as Record<string, unknown> },
  datosMock: { leerInforme: vi.fn(), listarInformes: vi.fn(), leerPropiedad: vi.fn(), guardarCambios: vi.fn(), volverABorrador: vi.fn() },
  servicioMock: {
    crearInformeManual: vi.fn(), vistaDelInforme: vi.fn(), refrescarFuente: vi.fn(),
    prepararCaptura: vi.fn(), confirmarCaptura: vi.fn(), quitarCaptura: vi.fn(), prepararPdf: vi.fn(), marcarInformeListo: vi.fn(),
  },
}))
vi.mock('@/lib/informes/acceso', () => ({
  autorizarInformesDe: vi.fn(async () => auth.r),
  esUuid: (v: string) => /^[0-9a-f-]{36}$/.test(v),
}))
vi.mock('@/lib/informes/datos', () => datosMock)
vi.mock('@/lib/informes/servicio', async () => {
  class ErrorInforme extends Error { constructor(public status: number, m: string) { super(m) } }
  return { ...servicioMock, ErrorInforme }
})

import { GET as listar, POST as crear } from '../properties/[id]/informes/route'
import { GET as leer, PATCH as guardar } from './[id]/route'
import { POST as fuente } from './[id]/fuentes/[fuente]/route'
import { POST as captura } from './[id]/capturas/[cual]/route'
import { POST as listo } from './[id]/listo/route'

const PROP = '33333333-3333-4333-8333-333333333333'
const INF = '11111111-1111-4111-8111-111111111111'
const req = (body?: unknown) => new Request('http://x', { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) as never
const p = <T,>(v: T) => ({ params: Promise.resolve(v) })

beforeEach(() => {
  auth.r = { ok: true, userId: 'u1', rol: 'coordinador' }
  Object.values(datosMock).forEach(m => m.mockReset())
  Object.values(servicioMock).forEach(m => m.mockReset())
  datosMock.leerInforme.mockResolvedValue({ id: INF, propertyId: PROP, estado: 'borrador', manual: {} })
  datosMock.leerPropiedad.mockResolvedValue({ id: PROP, capturadaEl: '2026-09-01T12:00:00Z' })
  datosMock.listarInformes.mockResolvedValue([])
})

describe('GET/POST /api/properties/[id]/informes', () => {
  it('lista y trae los atajos de fechas', async () => {
    const body = await (await listar(req(), p({ id: PROP }))).json()
    expect(body.data.informes).toEqual([])
    expect(body.data.atajos.ultimaQuincena).toHaveProperty('desde')
    expect(body.data.atajos.cicloDeLaPropiedad).toHaveProperty('desde')
  })
  it('sin permiso: el estado y el mensaje de la autorización, sin tocar la base', async () => {
    auth.r = { ok: false, status: 403, error: 'Los informes no están disponibles para tu rol' }
    expect((await listar(req(), p({ id: PROP }))).status).toBe(403)
    expect((await crear(req({ desde: '2026-10-01', hasta: '2026-10-15' }), p({ id: PROP }))).status).toBe(403)
    expect(datosMock.listarInformes).not.toHaveBeenCalled()
    expect(servicioMock.crearInformeManual).not.toHaveBeenCalled()
  })
  it('POST crea con las fechas; un cuerpo raro es 400', async () => {
    servicioMock.crearInformeManual.mockResolvedValue({ informe: { id: INF }, nuevo: true })
    const r = await crear(req({ desde: '2026-10-01', hasta: '2026-10-15' }), p({ id: PROP }))
    expect(r.status).toBe(201)
    expect(servicioMock.crearInformeManual).toHaveBeenCalledWith(PROP, '2026-10-01', '2026-10-15', 'u1', expect.any(Date))
    expect((await crear(req({ desde: '2026-10-01' }), p({ id: PROP }))).status).toBe(400)
  })
})

describe('/api/informes/[id]', () => {
  it('un id mal formado o un informe de una propiedad ajena dan el mismo 404', async () => {
    expect((await leer(req(), p({ id: 'x' }))).status).toBe(404)
    auth.r = { ok: false, status: 403, error: 'no' }
    expect((await leer(req(), p({ id: INF }))).status).toBe(404)
  })
  it('sin sesión: 401', async () => {
    auth.r = { ok: false, status: 401, error: 'Iniciá sesión de nuevo' }
    expect((await leer(req(), p({ id: INF }))).status).toBe(401)
  })
  it('PATCH valida antes de guardar (una clave como "estado" no pasa)', async () => {
    expect((await guardar(req({ estado: 'listo' }), p({ id: INF }))).status).toBe(400)
    expect(datosMock.guardarCambios).not.toHaveBeenCalled()
    datosMock.guardarCambios.mockResolvedValue(true)
    expect((await guardar(req({ manual: { zonaprop: { exposicion: 930 } } }), p({ id: INF }))).status).toBe(200)
  })
  it('PATCH sobre un informe listo: 409', async () => {
    datosMock.guardarCambios.mockResolvedValue(false)
    expect((await guardar(req({ manual: { zonaprop: { exposicion: 930 } } }), p({ id: INF }))).status).toBe(409)
  })
  it('una fuente o una captura desconocida: 404 sin leer el informe', async () => {
    expect((await fuente(req(), p({ id: INF, fuente: 'twitter' }))).status).toBe(404)
    expect((await captura(req({ nombre: 'a.png', bytes: 1 }), p({ id: INF, cual: 'facebook' }))).status).toBe(404)
    expect(datosMock.leerInforme).not.toHaveBeenCalled()
  })
  it('trae una fuente y devuelve su estado (una fuente caída es 200 con estado error)', async () => {
    servicioMock.refrescarFuente.mockResolvedValue({ estado: 'error', error: 'Meta no respondió' })
    const r = await fuente(req(), p({ id: INF, fuente: 'meta' }))
    expect(r.status).toBe(200)
    expect((await r.json()).data.estado).toBe('error')
  })
  it('"listo" sin PDF es 400', async () => {
    expect((await listo(req({}), p({ id: INF }))).status).toBe(400)
    expect(servicioMock.marcarInformeListo).not.toHaveBeenCalled()
  })
})
