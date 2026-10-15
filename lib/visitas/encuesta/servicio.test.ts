import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EncuestaFila } from './tipos'

const { mem, datosMock, mandarMock } = vi.hoisted(() => {
  const mem: { fila: EncuestaFila | null; existe: boolean } = { fila: null, existe: false }
  return {
    mem,
    mandarMock: vi.fn(),
    datosMock: {
      leerEncuestaDeVisita: vi.fn(async () => (mem.existe ? mem.fila : null)),
      asegurarEncuesta: vi.fn(async (f: { token: string; expiresAt: string }) => {
        mem.existe = true
        // Los tests siempre cargan la fila base antes de llamar.
        if (mem.fila) mem.fila = { ...mem.fila, token: f.token, expires_at: f.expiresAt }
        return mem.fila
      }),
      leerEncuestaConVisita: vi.fn(),
      leerAjustesEncuesta: vi.fn(),
      leerRegalo: vi.fn(),
      registrarEnvio: vi.fn(async (_id: string, c: Partial<EncuestaFila>) => { if (mem.fila) mem.fila = { ...mem.fila, ...c } }),
      estadoDelMensaje: vi.fn(async () => null),
    },
  }
})
vi.mock('./datos', () => datosMock)
vi.mock('./whatsapp', () => ({ mandarPlantilla: mandarMock }))
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { prepararYEnviarEncuesta, encuestaParaFicha, ReenvioNoPermitido } from './servicio'
import { encuestaConVisitaDePrueba, encuestaDePrueba, VISITA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const REGALO = { propertyId: 'p', titulo: 'Guía', archivoPath: 'x', archivoNombre: 'g.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockClear())
  mandarMock.mockReset()
  mem.fila = encuestaDePrueba(); mem.existe = false
  datosMock.leerEncuestaConVisita.mockImplementation(async () => (mem.fila ? { ...encuestaConVisitaDePrueba(), encuesta: mem.fila } : null))
  datosMock.leerAjustesEncuesta.mockResolvedValue(AJUSTES_PRUEBA)
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  vi.stubEnv('WHATSAPP_TEMPLATE_ENCUESTA_VISITA', 'encuesta_visita_v1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inmodf.com.ar')
})

describe('prepararYEnviarEncuesta', () => {
  it('crea el link (22 caracteres, 30 días) y con el envío apagado lo deja "Sin enviar (envío apagado)"', async () => {
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    const pedido = datosMock.asegurarEncuesta.mock.calls[0][0]
    expect(pedido.token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(pedido.expiresAt).toBe('2026-11-14T15:00:00.000Z')
    expect(datosMock.registrarEnvio).toHaveBeenCalledWith(mem.fila?.id, { send_status: 'omitida', send_skip_reason: 'envio_apagado', send_error: null })
    expect(mandarMock).not.toHaveBeenCalled()
    expect(f.estado.texto).toBe('Sin enviar (envío apagado)')
    expect(f.link).toMatch(/^https:\/\/inmodf\.com\.ar\/encuesta\/[A-Za-z0-9_-]{22}$/)
  })
  it('teléfono de prueba: manda la plantilla y anota envío, destino y mensaje', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.7' })
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    const [envio, destino] = mandarMock.mock.calls[0]
    expect(envio.templateName).toBe('encuesta_visita_v1')
    expect(envio.bodyParams.slice(0, 3)).toEqual(['Mariana', 'Doblas 248', '14/10'])
    expect(destino).toMatchObject({ telefono: '5491158234521', propertyId: '33333333-3333-4333-8333-333333333333', sentBy: 'u1' })
    expect(datosMock.registrarEnvio).toHaveBeenCalledWith(mem.fila?.id, {
      send_status: 'enviada', send_skip_reason: null, send_error: null,
      sent_at: AHORA.toISOString(), sent_to: '5491158234521', wa_message_id: 'wamid.7',
    })
    expect(f.estado.texto).toBe('Enviada')
  })
  it('Meta la rechaza: "Falló" con el motivo en castellano, y la función no lanza', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    mandarMock.mockResolvedValue({ ok: false, error: 'Template does not exist', codigo: 132001 })
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(f.estado).toEqual({ clave: 'fallo', texto: 'Falló: la plantilla no existe o todavía no está aprobada' })
  })
  it('WhatsApp en modo prueba: no se finge un envío', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: true, messageId: null })
    expect((await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })).estado.texto)
      .toBe('Sin enviar (WhatsApp en modo prueba)')
  })
  it('visita reabierta y vuelta a marcar realizada: mismo link y NO se pisa un envío que ya salió', async () => {
    mem.existe = true
    mem.fila = encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z', wa_message_id: 'wamid.1' })
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(datosMock.asegurarEncuesta).not.toHaveBeenCalled()
    expect(datosMock.registrarEnvio).not.toHaveBeenCalled()
    expect(mandarMock).not.toHaveBeenCalled()
  })
  it('un reenvío que la decisión no permite avisa por qué', async () => {
    mem.existe = true
    await expect(prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: true, actorId: 'u1', ahora: AHORA }))
      .rejects.toThrow(new ReenvioNoPermitido('envio_apagado'))
  })
  it('si no se puede leer el regalo cuenta como "sin regalo" (no manda con "solo con regalo")', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    datosMock.leerRegalo.mockRejectedValue(new Error('boom'))
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(f.estado.texto).toBe('Sin enviar (la propiedad no tiene regalo)')
  })
})

describe('encuestaParaFicha', () => {
  it('sin encuesta: null', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(null)
    expect(await encuestaParaFicha(VISITA_DE_PRUEBA, AHORA)).toBeNull()
  })
  it('lee el estado del webhook por wa_message_id y dice si se puede reenviar', async () => {
    mem.fila = encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z', wa_message_id: 'wamid.1' })
    datosMock.estadoDelMensaje.mockResolvedValueOnce({ status: 'delivered', error_code: null, error_message: null })
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    const f = await encuestaParaFicha(VISITA_DE_PRUEBA, AHORA)
    expect(datosMock.estadoDelMensaje).toHaveBeenCalledWith('wamid.1')
    expect(f).toMatchObject({ estado: { texto: 'Entregada' }, puedeReenviar: true })
  })
})
