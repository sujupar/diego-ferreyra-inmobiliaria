import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock, servicioMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222', logueado: true },
  datosMock: { leerVisita: vi.fn() },
  servicioMock: { asegurarLinkDeEncuesta: vi.fn(), encuestaParaFicha: vi.fn(), prepararYEnviarEncuesta: vi.fn(), ReenvioNoPermitido: class extends Error {} },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } } : null),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/visitas/encuesta/servicio', () => servicioMock)

import { GET, POST } from './route'

const VISITA = '66666666-6666-4666-8666-666666666666'
const FICHA = { link: 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y' }
const visita = (p: Record<string, unknown> = {}) => ({ id: VISITA, status: 'completed', advisor_id: estado.id, created_by: estado.id, ...p })
const ctx = (id = VISITA) => ({ params: Promise.resolve({ id }) })
const post = (body: unknown, id = VISITA) => POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never, ctx(id))

beforeEach(() => {
  datosMock.leerVisita.mockReset().mockResolvedValue(visita())
  servicioMock.asegurarLinkDeEncuesta.mockReset()
  servicioMock.encuestaParaFicha.mockReset().mockResolvedValue(FICHA)
  servicioMock.prepararYEnviarEncuesta.mockReset().mockResolvedValue(FICHA)
  estado.role = 'asesor'; estado.logueado = true
})

describe('/api/visits/[id]/encuesta', () => {
  it('sin sesión 401; abogado 403; ninguno lee', async () => {
    estado.logueado = false
    expect((await GET(new Request('http://local') as never, ctx())).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await GET(new Request('http://local') as never, ctx())).status).toBe(403)
    expect(datosMock.leerVisita).not.toHaveBeenCalled()
  })
  it('una visita ajena es 404 para el asesor; un id inventado también', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    expect((await GET(new Request('http://local') as never, ctx())).status).toBe(404)
    expect((await GET(new Request('http://local') as never, ctx('x'))).status).toBe(404)
  })
  it('GET devuelve la encuesta de la ficha', async () => {
    const body = await (await GET(new Request('http://local') as never, ctx())).json()
    expect(body.data).toEqual(FICHA)
  })
  it('crear link solo en una visita realizada', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ status: 'scheduled' }))
    const res = await post({ accion: 'link' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('La encuesta se crea cuando la visita se marca como realizada')
  })
  it('crear link (sin mandar nada)', async () => {
    expect((await post({ accion: 'link' })).status).toBe(200)
    expect(servicioMock.asegurarLinkDeEncuesta).toHaveBeenCalledWith(VISITA, estado.id, expect.any(Date))
    expect(servicioMock.prepararYEnviarEncuesta).not.toHaveBeenCalled()
  })
  it('reenviar llama con reenvío explícito; si no se puede, 409 con el motivo', async () => {
    expect((await post({ accion: 'reenviar' })).status).toBe(200)
    expect(servicioMock.prepararYEnviarEncuesta).toHaveBeenCalledWith(VISITA, { reenvio: true, actorId: estado.id, ahora: expect.any(Date) })
    servicioMock.prepararYEnviarEncuesta.mockRejectedValue(new servicioMock.ReenvioNoPermitido('No se puede reenviar: envío apagado'))
    const res = await post({ accion: 'reenviar' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('No se puede reenviar: envío apagado')
  })
  it('acción inválida: 400', async () => {
    expect((await post({ accion: 'borrar' })).status).toBe(400)
  })
})
