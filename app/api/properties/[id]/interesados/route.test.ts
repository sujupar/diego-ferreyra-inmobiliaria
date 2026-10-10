import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: {
    leerPropiedadParaVisita: vi.fn(), listarConsultasDeLaPropiedad: vi.fn(),
    listarRegistrosDeLaPropiedad: vi.fn(), visitasActivasDeLaPropiedad: vi.fn(),
  },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)

import { GET } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
function pedir(origen: string) {
  const req = new Request(`http://local/api/properties/${PROP}/interesados?origen=${origen}`)
  return GET(Object.assign(req, { nextUrl: new URL(req.url) }) as never, { params: Promise.resolve({ id: PROP }) })
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  estado.role = 'asesor'
  datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: estado.id })
  datosMock.listarConsultasDeLaPropiedad.mockResolvedValue([
    { id: 'c1', lead_name: 'Ana', lead_phone: '1158234521', lead_email: null, portal: 'zonaprop', received_at: '2026-10-08T00:00:00Z', created_at: '2026-10-08T00:00:00Z' },
  ])
  datosMock.listarRegistrosDeLaPropiedad.mockResolvedValue([])
  datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([])
})

describe('GET /api/properties/[id]/interesados', () => {
  it('portal: devuelve quienes consultaron por la propiedad', async () => {
    const res = await pedir('portal')
    expect(res.status).toBe(200)
    expect((await res.json()).data.map((i: { nombre: string }) => i.nombre)).toEqual(['Ana'])
    expect(datosMock.listarRegistrosDeLaPropiedad).not.toHaveBeenCalled()
  })
  it('un asesor no ve los interesados de una propiedad ajena', async () => {
    datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: 'otro' })
    expect((await pedir('portal')).status).toBe(403)
  })
  it('origen inválido: 400; abogado: 403', async () => {
    expect((await pedir('tasacion')).status).toBe(400)
    estado.role = 'abogado'
    expect((await pedir('portal')).status).toBe(403)
  })
})
