import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock } = vi.hoisted(() => ({
  datosMock: { leerEncuestaConVisita: vi.fn(), leerRegalo: vi.fn(), urlFirmada: vi.fn(), leerAjustesEncuesta: vi.fn(), registrarUso: vi.fn() },
}))
vi.mock('./datos', () => datosMock)
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { leerEncuestaPublica } from './publica-servidor'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const REGALO = { propertyId: 'p', titulo: 'Guía', archivoPath: 'a', archivoNombre: 'g.pdf', archivoBytes: 1, portadaPath: 'properties/p/portada-x.jpg', actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.urlFirmada.mockResolvedValue('https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/sign/x')
  datosMock.leerAjustesEncuesta.mockResolvedValue(AJUSTES_PRUEBA)
  vi.stubEnv('WHATSAPP_TEMPLATE_REGALO_VISITA', 'regalo_visita_v1')
})

describe('leerEncuestaPublica', () => {
  it('un token con otra forma no toca la base', async () => {
    expect(await leerEncuestaPublica('x', AHORA)).toEqual({ tipo: 'no_disponible' })
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('arma el regalo con su portada firmada y NO marca "abierta" (eso lo hace el navegador)', async () => {
    const r = await leerEncuestaPublica(TOKEN_DE_PRUEBA, AHORA)
    expect(r.tipo === 'disponible' && r.encuesta.regalo).toEqual({ titulo: 'Guía', portada: 'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/sign/x' })
    expect(r.tipo === 'disponible' && r.encuesta.regaloPorWhatsapp).toBe(false)
    expect(datosMock.registrarUso).not.toHaveBeenCalled()
  })
  it('promete WhatsApp solo si ese envío va a ocurrir (teléfono de prueba)', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['1158234521'] })
    const r = await leerEncuestaPublica(TOKEN_DE_PRUEBA, AHORA)
    expect(r.tipo === 'disponible' && r.encuesta.regaloPorWhatsapp).toBe(true)
  })
  it('si el regalo no se puede leer, la encuesta sale igual (sin regalo)', async () => {
    datosMock.leerRegalo.mockRejectedValue(new Error('boom'))
    const r = await leerEncuestaPublica(TOKEN_DE_PRUEBA, AHORA)
    expect(r.tipo === 'disponible' && r.encuesta.regalo).toBeNull()
  })
})
