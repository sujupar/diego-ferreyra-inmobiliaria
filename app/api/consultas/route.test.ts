import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ConsultaFila } from '@/lib/consultas/tipos'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  datosMock: {
    leerPeriodo: vi.fn(),
    MAX_CONSULTAS_PERIODO: 3000,
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
  datosMock.leerPeriodo.mockReset()
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  estado.id = '11111111-1111-4111-8111-111111111111'
  datosMock.leerPeriodo.mockResolvedValue({ filas: [], visitas: [], propiedades: new Map(), asesores: new Map(), truncado: false })
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
    expect(datosMock.leerPeriodo).not.toHaveBeenCalled()
  })

  it('rol desconocido: 403', async () => {
    estado.role = 'inventado'
    expect((await pedir()).status).toBe(403)
  })

  it('asesor: UNA lectura con alcance propio, aunque pida ?asesor=<otro> o una propiedad ajena', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    expect((await pedir(`asesor=${OTRO}&propiedad=${AJENA}`)).status).toBe(200)
    expect(datosMock.leerPeriodo).toHaveBeenCalledTimes(1)
    expect(datosMock.leerPeriodo.mock.calls[0][0].alcance).toEqual({ tipo: 'propio', usuarioId: ASESOR })
  })

  it('quien ve todo: alcance todo', async () => {
    await pedir()
    expect(datosMock.leerPeriodo.mock.calls[0][0].alcance).toEqual({ tipo: 'todo' })
  })

  it('?periodo=zzz → período por defecto (7 días), no 400', async () => {
    const res = await pedir('periodo=zzz')
    expect(res.status).toBe(200)
    expect(datosMock.leerPeriodo.mock.calls[0][0]).toMatchObject({
      desde: '2099-01-04T00:00:00.000-03:00', hasta: '2099-01-10T23:59:59.999999-03:00',
    })
    expect((await res.json()).periodo).toEqual({ desde: '2099-01-04', hasta: '2099-01-10', etiqueta: 'Últimos 7 días' })
  })

  it('rango imposible: 400 con mensaje', async () => {
    const res = await pedir('from=2026-10-05&to=2026-10-01')
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
    expect(datosMock.leerPeriodo).not.toHaveBeenCalled()
  })

  it('responde el período entero con cada consulta decidida (estado, asesor, propiedad)', async () => {
    datosMock.leerPeriodo.mockResolvedValue({
      filas: [
        fila({ id: 'a', portal: 'zonaprop' }),
        fila({ id: 'b', portal: 'argenprop', property_id: null, asesor_propiedad: null, telefono: null }),
      ],
      visitas: [
        { id: 'v1', property_id: PROP, portal_inquiry_id: 'a', lead_id: null, client_phone: null, status: 'scheduled', scheduled_at: '2099-01-12T14:00:00Z' },
      ],
      propiedades: new Map([[PROP, { address: 'Doblas 248', neighborhood: 'Caballito' }]]),
      asesores: new Map([[ASESOR, 'Lucas']]),
      truncado: false,
    })
    const res = await pedir('portal=zonaprop')
    expect(res.status).toBe(200)
    const body = await res.json()
    // El filtro de portal NO se aplica en el servidor: viaja el período entero.
    expect(body.consultas).toHaveLength(2)
    expect(body.truncado).toBe(false)
    expect(body.consultas.find((f: { id: string }) => f.id === 'a')).toMatchObject({
      estado: { tipo: 'con_visita', visitaId: 'v1' }, asesor_nombre: 'Lucas', propiedad: { address: 'Doblas 248' },
    })
    expect(body.consultas.find((f: { id: string }) => f.id === 'b')).toMatchObject({ accion: 'elegir_propiedad' })
  })

  it('avisa si el período quedó cortado', async () => {
    datosMock.leerPeriodo.mockResolvedValue({ filas: [fila()], visitas: [], propiedades: new Map(), asesores: new Map(), truncado: true })
    expect((await (await pedir()).json()).truncado).toBe(true)
  })

  it('si la base falla: 500 con mensaje en castellano', async () => {
    datosMock.leerPeriodo.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos cargar las consultas')
  })
})
