import { describe, it, expect, vi, beforeEach } from 'vitest'

const { usuario, datosMock } = vi.hoisted(() => ({
  usuario: { u: { id: 'u1', profile: { role: 'coordinador', is_active: true } } as Record<string, unknown> | null },
  datosMock: { listarParaElListado: vi.fn(), propiedadesDelAsesor: vi.fn(), cierresDePeriodo: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({ getUser: vi.fn(async () => usuario.u) }))
vi.mock('@/lib/informes/datos', () => datosMock)
vi.mock('@/lib/informes/resumen', () => ({ faltantes: () => ['Zonaprop'] }))

import { GET } from './route'

const req = (q = '') => new Request(`http://x/api/informes${q}`) as never
const informe = (id: string, estado: 'borrador' | 'listo', hasta: string) =>
  ({ informe: { id, propertyId: `p-${id}`, desde: '2026-10-01', hasta, origen: 'ciclo', estado, listoAt: null }, direccion: `Calle ${id}` })

beforeEach(() => {
  usuario.u = { id: 'u1', profile: { role: 'coordinador', is_active: true } }
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.listarParaElListado.mockResolvedValue([informe('a', 'listo', '2026-10-15'), informe('b', 'borrador', '2026-10-15')])
  datosMock.cierresDePeriodo.mockResolvedValue(['2026-10-15'])
})

describe('GET /api/informes', () => {
  it('la coordinación ve todos, con los por completar primero y cuántas cosas les faltan', async () => {
    const body = await (await GET(req())).json()
    expect(datosMock.listarParaElListado).toHaveBeenCalledWith({ propertyIds: null, estado: null, hasta: null })
    expect(body.data.informes.map((f: { id: string }) => f.id)).toEqual(['b', 'a'])
    expect(body.data.informes[0].faltantes).toBe(1)
    expect(body.data.informes[1].faltantes).toBe(0)
    expect(body.data.periodos).toEqual(['2026-10-15'])
  })
  it('el asesor ve solo los de sus propiedades', async () => {
    usuario.u = { id: 'u2', profile: { role: 'asesor', is_active: true } }
    datosMock.propiedadesDelAsesor.mockResolvedValue(['p-b'])
    await GET(req())
    expect(datosMock.propiedadesDelAsesor).toHaveBeenCalledWith('u2')
    expect(datosMock.listarParaElListado).toHaveBeenCalledWith({ propertyIds: ['p-b'], estado: null, hasta: null })
  })
  it('el abogado: 403 sin tocar la base; sin sesión: 401', async () => {
    usuario.u = { id: 'u3', profile: { role: 'abogado', is_active: true } }
    expect((await GET(req())).status).toBe(403)
    usuario.u = null
    expect((await GET(req())).status).toBe(401)
    expect(datosMock.listarParaElListado).not.toHaveBeenCalled()
  })
  it('filtra por estado y período; valores raros son 400', async () => {
    await GET(req('?estado=borrador&hasta=2026-10-15'))
    expect(datosMock.listarParaElListado).toHaveBeenCalledWith({ propertyIds: null, estado: 'borrador', hasta: '2026-10-15' })
    expect((await GET(req('?estado=todo'))).status).toBe(400)
    expect((await GET(req('?hasta=15-10-2026'))).status).toBe(400)
  })
})
