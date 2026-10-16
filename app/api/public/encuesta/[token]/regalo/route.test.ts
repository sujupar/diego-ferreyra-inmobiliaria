import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock } = vi.hoisted(() => ({
  datosMock: { leerEncuestaConVisita: vi.fn(), leerRegalo: vi.fn(), urlFirmada: vi.fn(), marcarRegaloDescargado: vi.fn() },
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { GET } from './route'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const pedir = (token = TOKEN_DE_PRUEBA) => GET(new Request('http://local') as never, { params: Promise.resolve({ token }) })
const REGALO = { propertyId: 'p', titulo: 'Guía', archivoPath: 'properties/p/regalo-x.pdf', archivoNombre: 'Guía "del" barrio.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.urlFirmada.mockResolvedValue('https://firmada.supabase.co/x?token=1')
})

describe('GET /api/public/encuesta/[token]/regalo', () => {
  it('sin terminar la encuesta no entrega nada (criterio 27)', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    expect((await pedir()).status).toBe(404)
    expect(datosMock.urlFirmada).not.toHaveBeenCalled()
  })
  it('visita reabierta después de "Se realizó": el mismo 404, aunque la encuesta ya esté completed_at', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }, { status: 'scheduled' }))
    expect((await pedir()).status).toBe(404)
    expect(datosMock.urlFirmada).not.toHaveBeenCalled()
  })
  it('terminada: 302 a una URL firmada de 10 minutos, con nombre seguro, sin caché', async () => {
    const res = await pedir()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://firmada.supabase.co/x?token=1')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(datosMock.urlFirmada).toHaveBeenCalledWith('properties/p/regalo-x.pdf', 600, 'Guía del barrio.pdf')
    expect(datosMock.marcarRegaloDescargado).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA)
  })
  it('token con otra forma: 404; propiedad sin regalo: 404; firma caída: 503', async () => {
    expect((await pedir('x')).status).toBe(404)
    datosMock.leerRegalo.mockResolvedValue(null)
    expect((await pedir()).status).toBe(404)
    datosMock.leerRegalo.mockResolvedValue(REGALO)
    datosMock.urlFirmada.mockResolvedValue(null)
    expect((await pedir()).status).toBe(503)
  })
})
