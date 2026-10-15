import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock, procesarMock } = vi.hoisted(() => ({
  datosMock: { leerEncuestaConVisita: vi.fn(), registrarUso: vi.fn() },
  procesarMock: vi.fn(),
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)
vi.mock('@/lib/visitas/encuesta/avisos-servicio', () => ({ procesarAvisosDeEncuesta: procesarMock }))

import { POST } from './route'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const pedir = (token = TOKEN_DE_PRUEBA) => POST(new Request('http://local', { method: 'POST' }) as never, { params: Promise.resolve({ token }) })

beforeEach(() => {
  datosMock.leerEncuestaConVisita.mockReset().mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
  datosMock.registrarUso.mockReset().mockResolvedValue(true)
  procesarMock.mockReset().mockResolvedValue({ equipo: 'enviado' })
})

describe('POST /api/public/encuesta/[token]/avisos', () => {
  it('un token con otra forma: 404 sin tocar la base', async () => {
    expect((await pedir('x')).status).toBe(404)
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('sin terminar: 409; tope de escrituras: 429', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    expect((await pedir()).status).toBe(409)
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
    datosMock.registrarUso.mockResolvedValue(false)
    expect((await pedir()).status).toBe(429)
    expect(procesarMock).not.toHaveBeenCalled()
  })
  it('terminada: procesa sus avisos con el reloj del pedido', async () => {
    const body = await (await pedir()).json()
    expect(procesarMock).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, { inicio: expect.any(Number), ahora: expect.any(Date) })
    expect(body.data).toEqual({ equipo: 'enviado' })
  })
})
