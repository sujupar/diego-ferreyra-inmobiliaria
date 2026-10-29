import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ConsultaFila } from '@/lib/consultas/tipos'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  datosMock: {
    consultasDelPeriodo: vi.fn(),
    visitasParaConsultas: vi.fn(),
    propiedadesYAsesores: vi.fn(),
  },
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@/lib/consultas/datos', () => datosMock)

import { GET } from './route'

const ASESOR = '22222222-2222-4222-8222-222222222222'
const OTRO = '77777777-7777-4777-8777-777777777777'
const PROP = '33333333-3333-4333-8333-333333333333'
const AJENA = '44444444-4444-4444-8444-444444444444'

function fila(p: Partial<ConsultaFila> = {}): ConsultaFila {
  return {
    id: 'c-1', tipo: 'portal', numero: 1, recibida_at: '2099-01-09T15:00:00Z', canal: 'mail',
    portal: 'zonaprop', nombre: 'Ana', telefono: '+5491161400496', email: null, mensaje: null,
    property_id: PROP, assigned_to: null, asesor_propiedad: ASESOR, aviso_codigo: null, aviso_url: null,
    aviso_direccion: null, aviso_titulo: null, utm: null, ...p,
  }
}

function pedir(qs = '') {
  return GET(new NextRequest(`http://local/api/consultas${qs ? `?${qs}` : ''}`))
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  estado.id = '11111111-1111-4111-8111-111111111111'
  datosMock.consultasDelPeriodo.mockResolvedValue({ filas: [], truncado: false })
  datosMock.visitasParaConsultas.mockResolvedValue([])
  datosMock.propiedadesYAsesores.mockResolvedValue({ propiedades: new Map(), asesores: new Map() })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-10T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('GET /api/consultas', () => {
  it('sin sesión o inactivo: 401', async () => {
    estado.logueado = false
    expect((await pedir()).status).toBe(401)
    estado.logueado = true; estado.activo = false
    expect((await pedir()).status).toBe(401)
  })

  it('abogado: 403 y no toca la base', async () => {
    estado.role = 'abogado'
    expect((await pedir()).status).toBe(403)
    expect(datosMock.consultasDelPeriodo).not.toHaveBeenCalled()
  })

  it('rol desconocido: 403', async () => {
    estado.role = 'inventado'
    expect((await pedir()).status).toBe(403)
  })

  it('asesor con ?asesor=<otro>: alcance propio y el filtro de asesor se ignora', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    expect((await pedir(`asesor=${OTRO}`)).status).toBe(200)
    expect(datosMock.consultasDelPeriodo).toHaveBeenCalledTimes(1)
    expect(datosMock.consultasDelPeriodo.mock.calls[0][0]).toMatchObject({
      alcance: { tipo: 'propio', usuarioId: ASESOR }, asesor: null,
    })
  })

  it('asesor con ?propiedad=<ajena>: todas las lecturas van con alcance propio', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    expect((await pedir(`propiedad=${AJENA}`)).status).toBe(200)
    const llamadas = datosMock.consultasDelPeriodo.mock.calls.map(c => c[0])
    expect(llamadas.length).toBeGreaterThan(0)
    for (const f of llamadas) expect(f.alcance).toEqual({ tipo: 'propio', usuarioId: ASESOR })
    expect(llamadas[0]).toMatchObject({ propiedad: AJENA })
  })

  it('quien ve todo: alcance todo y el filtro de asesor pasa', async () => {
    await pedir(`asesor=${OTRO}`)
    expect(datosMock.consultasDelPeriodo.mock.calls[0][0]).toMatchObject({ alcance: { tipo: 'todo' }, asesor: OTRO })
  })

  it('?periodo=zzz → período por defecto (7 días), no 400', async () => {
    const res = await pedir('periodo=zzz')
    expect(res.status).toBe(200)
    expect(datosMock.consultasDelPeriodo.mock.calls[0][0]).toMatchObject({
      desde: '2099-01-04T00:00:00.000-03:00', hasta: '2099-01-10T23:59:59.999999-03:00',
    })
    expect((await res.json()).periodo).toEqual({ desde: '2099-01-04', hasta: '2099-01-10', etiqueta: 'Últimos 7 días' })
  })

  it('rango imposible: 400 con mensaje', async () => {
    const res = await pedir('from=2026-10-05&to=2026-10-01')
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
    expect(datosMock.consultasDelPeriodo).not.toHaveBeenCalled()
  })

  it('la búsqueda llega normalizada a la base', async () => {
    await pedir('q=%20%20Ana%20%20')
    expect(datosMock.consultasDelPeriodo.mock.calls[0][0]).toMatchObject({ q: 'Ana' })
  })

  it('responde la bandeja: porPagina 25, tarjetas, conteos, estado y nombres', async () => {
    datosMock.consultasDelPeriodo.mockResolvedValue({
      filas: [
        fila({ id: 'a', portal: 'zonaprop' }),
        fila({ id: 'b', portal: 'argenprop', property_id: null, asesor_propiedad: null, telefono: null }),
      ],
      truncado: false,
    })
    datosMock.visitasParaConsultas.mockResolvedValue([
      { id: 'v1', property_id: PROP, portal_inquiry_id: 'a', client_phone: null, status: 'scheduled', scheduled_at: '2099-01-12T14:00:00Z' },
    ])
    datosMock.propiedadesYAsesores.mockResolvedValue({
      propiedades: new Map([[PROP, { address: 'Doblas 248', neighborhood: 'Caballito' }]]),
      asesores: new Map([[ASESOR, 'Lucas']]),
    })
    const res = await pedir()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      total: 2, pagina: 1, porPagina: 25,
      tarjetas: { sinVisita: 1, sinPropiedad: 1, telefonoRevisar: 1 },
      porPortal: [{ valor: 'argenprop', etiqueta: 'Argenprop', n: 1 }, { valor: 'zonaprop', etiqueta: 'ZonaProp', n: 1 }],
      porPropiedad: [
        { valor: 'sin', etiqueta: 'Sin propiedad identificada', n: 1 },
        { valor: PROP, etiqueta: 'Doblas 248', n: 1 },
      ],
    })
    expect(body.truncado).toBeUndefined()
    const a = body.filas.find((f: { id: string }) => f.id === 'a')
    expect(a).toMatchObject({ estado: { tipo: 'con_visita', visitaId: 'v1' }, asesor_nombre: 'Lucas', propiedad: { address: 'Doblas 248' } })
    // Visitas: por los ids de las consultas de portal y las propiedades traídas.
    expect(datosMock.visitasParaConsultas).toHaveBeenCalledWith([PROP], ['a', 'b'])
    expect(datosMock.propiedadesYAsesores.mock.calls[0][0]).toEqual([PROP])
    expect(datosMock.propiedadesYAsesores.mock.calls[0][1]).toEqual([ASESOR])
  })

  it('sin filtro de portal ni propiedad, una sola lectura de consultas', async () => {
    await pedir()
    expect(datosMock.consultasDelPeriodo).toHaveBeenCalledTimes(1)
  })

  it('con filtro de portal, los conteos de portal salen de una lectura SIN ese filtro', async () => {
    datosMock.consultasDelPeriodo.mockImplementation(async (f: { portal: string | null }) => ({
      filas: f.portal ? [fila({ id: 'z', portal: 'zonaprop' })]
        : [fila({ id: 'z', portal: 'zonaprop' }), fila({ id: 'm', portal: 'mercadolibre' })],
      truncado: false,
    }))
    const body = await (await pedir('portal=zonaprop')).json()
    expect(datosMock.consultasDelPeriodo).toHaveBeenCalledTimes(2)
    expect(datosMock.consultasDelPeriodo.mock.calls[1][0]).toMatchObject({ portal: null })
    expect(body.total).toBe(1)
    expect(body.porPortal.map((o: { valor: string }) => o.valor).sort()).toEqual(['mercadolibre', 'zonaprop'])
  })

  it('con filtro de propiedad, los conteos de propiedad salen de una lectura SIN ese filtro', async () => {
    datosMock.consultasDelPeriodo.mockImplementation(async (f: { propiedad: string | null }) => ({
      filas: f.propiedad ? [fila({ id: 'x', property_id: null })]
        : [fila({ id: 'x', property_id: null }), fila({ id: 'y' })],
      truncado: false,
    }))
    const body = await (await pedir('propiedad=sin')).json()
    expect(datosMock.consultasDelPeriodo.mock.calls[1][0]).toMatchObject({ propiedad: null })
    expect(body.porPropiedad.map((o: { valor: string }) => o.valor)).toEqual(['sin', PROP])
  })

  it('pagina y avisa si la lectura quedó truncada', async () => {
    datosMock.consultasDelPeriodo.mockResolvedValue({
      filas: Array.from({ length: 30 }, (_, i) => fila({ id: `c-${String(i).padStart(2, '0')}` })),
      truncado: true,
    })
    const body = await (await pedir('pagina=2')).json()
    expect(body).toMatchObject({ pagina: 2, total: 30, truncado: true })
    expect(body.filas).toHaveLength(5)
  })

  it('si la base falla: 500 con mensaje en castellano', async () => {
    datosMock.consultasDelPeriodo.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos cargar las consultas')
  })
})
