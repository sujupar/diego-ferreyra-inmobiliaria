import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock, mandarMock, equipoMock, regaloEmailMock } = vi.hoisted(() => ({
  datosMock: {
    leerEncuestaConVisita: vi.fn(), reservarAviso: vi.fn(), cerrarAviso: vi.fn(), leerRegalo: vi.fn(),
    leerAjustesEncuesta: vi.fn(), urlFirmada: vi.fn(), encuestasConAvisosPendientes: vi.fn(),
  },
  mandarMock: vi.fn(),
  equipoMock: vi.fn(),
  regaloEmailMock: vi.fn(),
}))
vi.mock('./datos', () => datosMock)
vi.mock('./whatsapp', () => ({ mandarPlantilla: mandarMock }))
vi.mock('@/lib/email/notifications/visit-survey-answered', () => ({ notificarEncuestaRespondida: equipoMock, TECHO_POR_DESTINATARIO_MS: 3000 }))
vi.mock('@/lib/email/notifications/visit-survey-gift', () => ({ enviarRegaloPorEmail: regaloEmailMock }))
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { procesarAvisosDeEncuesta, barrerAvisosPendientes } from './avisos-servicio'
import { encuestaConVisitaDePrueba, ENCUESTA_DE_PRUEBA, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const SALIO = { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }
const REGALO = { propertyId: 'p', titulo: 'Guía de Caballito', archivoPath: 'properties/p/regalo-x.pdf', archivoNombre: 'Guía.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }
const terminada = (c = {}) => encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:59:00Z', contact_phone: '5491158234521', contact_email: 'ana@mail.com', liked: true, ...c })
let t = 0
const ctx = () => ({ inicio: 0, ahora: AHORA, reloj: () => t })

beforeEach(() => {
  t = 0
  Object.values(datosMock).forEach(m => m.mockReset())
  mandarMock.mockReset(); equipoMock.mockReset(); regaloEmailMock.mockReset()
  datosMock.leerEncuestaConVisita.mockResolvedValue(terminada())
  datosMock.reservarAviso.mockResolvedValue(true)
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.leerAjustesEncuesta.mockResolvedValue(AJUSTES_PRUEBA)
  datosMock.urlFirmada.mockResolvedValue('https://firmada/pdf')
  equipoMock.mockResolvedValue(SALIO)
  regaloEmailMock.mockResolvedValue(SALIO)
  vi.stubEnv('WHATSAPP_TEMPLATE_REGALO_VISITA', 'regalo_visita_v1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inmodf.com.ar')
})

describe('procesarAvisosDeEncuesta', () => {
  it('equipo y email del regalo salen; WhatsApp apagado no corresponde', async () => {
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r).toEqual({ equipo: 'enviado', regalo_whatsapp: 'no_corresponde', regalo_email: 'enviado' })
    expect(regaloEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@mail.com', nombre: 'Mariana', titulo: 'Guía de Caballito',
      urlDescarga: `https://inmodf.com.ar/api/public/encuesta/${TOKEN_DE_PRUEBA}/regalo`,
    }))
    expect(datosMock.cerrarAviso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, 'equipo', 'enviado', {})
  })
  it('un teléfono de prueba recibe el PDF por WhatsApp con el interruptor apagado', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['1158234521'] })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.9' })
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r.regalo_whatsapp).toBe('enviado')
    expect(mandarMock.mock.calls[0][1]).toMatchObject({ telefono: '5491158234521', documento: { link: 'https://firmada/pdf', nombre: 'Guía.pdf' } })
    expect(datosMock.cerrarAviso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, 'regalo_whatsapp', 'enviado', { waMessageId: 'wamid.9' })
  })
  it('una reserva tomada por otro pedido no se manda (doble pantalla de gracias)', async () => {
    datosMock.reservarAviso.mockResolvedValue(false)
    expect(await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())).toEqual({ equipo: 'ocupado', regalo_whatsapp: 'ocupado', regalo_email: 'ocupado' })
    expect(equipoMock).not.toHaveBeenCalled()
  })
  it('email vencido: fallido, sin reintento; otro fallo: pendiente y cuenta el intento', async () => {
    equipoMock.mockResolvedValue({ ok: false, sent: 0, failed: 1, skipped: 0, errors: ['Tiempo de espera agotado: Resend no respondió en 3000 ms'] })
    regaloEmailMock.mockResolvedValue({ ok: false, sent: 0, failed: 1, skipped: 0, errors: ['500 Resend'] })
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r.equipo).toBe('fallido')
    expect(r.regalo_email).toBe('pendiente')
    expect(datosMock.cerrarAviso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, 'regalo_email', 'pendiente', { error: '500 Resend', intentos: 1 })
  })
  it('si ya pasaron 6 s, el email al equipo queda para el barrido pero el regalo sale', async () => {
    t = 6_000
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r.equipo).toBe('sin_tiempo')
    expect(r.regalo_email).toBe('enviado')
  })
  it('sin email no hay email del regalo; sin regalo no hay regalo', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(terminada({ contact_email: null }))
    datosMock.leerRegalo.mockResolvedValue(null)
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r).toMatchObject({ regalo_whatsapp: 'no_corresponde', regalo_email: 'no_corresponde' })
    expect(regaloEmailMock).not.toHaveBeenCalled()
  })
  it('una encuesta sin terminar no avisa nada', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    expect(await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())).toEqual({})
    expect(datosMock.reservarAviso).not.toHaveBeenCalled()
  })
})

describe('barrerAvisosPendientes', () => {
  it('procesa las pendientes y corta cuando se acaba el tiempo', async () => {
    datosMock.encuestasConAvisosPendientes.mockResolvedValue(['a', 'b'])
    let llamadas = 0
    datosMock.leerEncuestaConVisita.mockImplementation(async () => { llamadas++; t = 17_000; return terminada() })
    const r = await barrerAvisosPendientes(ctx())
    expect(datosMock.encuestasConAvisosPendientes).toHaveBeenCalledWith({ desde: '2026-10-08T15:00:00.000Z', hasta: '2026-10-15T14:58:00.000Z' }, 3)
    expect(llamadas).toBe(1)
    expect(r).toEqual({ revisadas: 2, canalesEnviados: 0, sinTiempo: 1 })
  })
})
