import { describe, it, expect, vi, beforeEach } from 'vitest'

const { accesoMock, datosMock } = vi.hoisted(() => ({
  accesoMock: vi.fn(),
  datosMock: { crearSubidaFirmada: vi.fn() },
}))
vi.mock('@/lib/visitas/encuesta/acceso-regalo', () => ({ autorizarRegalo: accesoMock }))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { POST } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const post = (body: unknown) => POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: PROP }) })

beforeEach(() => {
  accesoMock.mockReset().mockResolvedValue({ ok: true, userId: 'u1' })
  datosMock.crearSubidaFirmada.mockReset().mockImplementation(async (path: string) => ({ signedUrl: `https://sube/${path}`, token: 't', path }))
})

describe('POST /api/properties/[id]/regalo/subida', () => {
  it('firma la subida del PDF y de la portada en paths de ESTA propiedad', async () => {
    const body = await (await post({ archivo: { nombre: 'Guía.pdf', bytes: 1000 }, portada: { nombre: 'tapa.jpeg', bytes: 100 } })).json()
    expect(body.data.archivo.path).toMatch(new RegExp(`^properties/${PROP}/regalo-[0-9a-f-]{36}\\.pdf$`))
    expect(body.data.portada.path).toMatch(new RegExp(`^properties/${PROP}/portada-[0-9a-f-]{36}\\.jpg$`))
  })
  it('valida antes de firmar: no-PDF, demasiado grande, nada para subir', async () => {
    expect((await post({ archivo: { nombre: 'g.docx', bytes: 10 } })).status).toBe(400)
    expect((await post({ archivo: { nombre: 'g.pdf', bytes: 30 * 1024 * 1024 } })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect(datosMock.crearSubidaFirmada).not.toHaveBeenCalled()
  })
  it('sin permiso: el código de autorizarRegalo, sin firmar nada', async () => {
    accesoMock.mockResolvedValue({ ok: false, status: 403, error: 'Solo quien gestiona la propiedad puede cargar el regalo' })
    expect((await post({ archivo: { nombre: 'g.pdf', bytes: 10 } })).status).toBe(403)
    expect(datosMock.crearSubidaFirmada).not.toHaveBeenCalled()
  })
})
