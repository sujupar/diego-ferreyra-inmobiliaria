import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EncuestaFila, EstadoWa } from './tipos'

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
      estadoDelMensaje: vi.fn(async (): Promise<EstadoWa | null> => null),
      reservarEnvio: vi.fn(async () => true),
      liberarEnvio: vi.fn(async () => undefined),
      plantillaDelMensaje: vi.fn(async (): Promise<string | null> => 'encuesta_visita_v4'),
      leerEncuestaPorMensaje: vi.fn(),
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

import { prepararYEnviarEncuesta, encuestaParaFicha, ReenvioNoPermitido, EnvioEnCurso, mandarRespaldoSiCorresponde } from './servicio'
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
  it('un envío que ya FALLÓ tampoco se pisa con "omitida" al volver a marcar realizada', async () => {
    mem.existe = true
    mem.fila = encuestaDePrueba({ send_status: 'fallida', send_error: 'la plantilla no existe' })
    await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(datosMock.registrarEnvio).not.toHaveBeenCalled()
  })
  it('candado: dos reenvíos casi juntos, el segundo no manda y responde "ya se está enviando"', async () => {
    mem.existe = true
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    datosMock.reservarEnvio.mockResolvedValueOnce(false)
    await expect(prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: true, actorId: 'u1', ahora: AHORA }))
      .rejects.toThrow(new EnvioEnCurso())
    expect(mandarMock).not.toHaveBeenCalled()
    expect(datosMock.registrarEnvio).not.toHaveBeenCalled()
  })
  it('candado: el envío automático en carrera con otro no manda ni registra nada (la otra llamada se encarga)', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    datosMock.reservarEnvio.mockResolvedValueOnce(false)
    await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(mandarMock).not.toHaveBeenCalled()
    expect(datosMock.registrarEnvio).not.toHaveBeenCalled()
  })
  it('el candado se toma por 30 segundos y se libera al terminar (éxito o fallo)', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.7' })
    await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(datosMock.reservarEnvio).toHaveBeenCalledWith(mem.fila?.id, 30)
    expect(datosMock.liberarEnvio).toHaveBeenCalledWith(mem.fila?.id)
    mandarMock.mockResolvedValue({ ok: false, error: 'rechazado', codigo: null })
    // Primer envío ya quedó "enviada": con reenvio:true la decisión no lo bloquea por "ya_enviada".
    await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: true, actorId: 'u1', ahora: AHORA })
    expect(datosMock.liberarEnvio).toHaveBeenCalledTimes(2)
  })
  it('Meta aceptó pero no se pudo guardar el envío: el error y el log llevan el wa_message_id y el teléfono ENMASCARADO', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.9' })
    datosMock.registrarEnvio.mockImplementationOnce(async () => { throw new Error('boom') })
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA }))
      .rejects.toThrow(/wamid\.9.*11 ••••-4521/)
    expect(consola.mock.calls.some(c => String(c[0]).includes('wamid.9') && String(c[0]).includes('11 ••••-4521'))).toBe(true)
    // El teléfono entero no queda en el error ni en el log: solo los últimos 4 dígitos.
    expect(consola.mock.calls.every(c => !String(c[0]).includes('5491158234521'))).toBe(true)
    expect(datosMock.liberarEnvio).toHaveBeenCalled()
    consola.mockRestore()
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
    expect(f).toMatchObject({ estado: { texto: 'Entregada' }, puedeReenviar: true, linkDisponible: true })
  })
  it('visita reabierta (ya no "completed"): ni link disponible ni se puede reenviar', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    datosMock.leerEncuestaConVisita.mockImplementation(async () =>
      (mem.fila ? encuestaConVisitaDePrueba(mem.fila, { status: 'scheduled' }) : null))
    const f = await encuestaParaFicha(VISITA_DE_PRUEBA, AHORA)
    expect(f).toMatchObject({ linkDisponible: false, puedeReenviar: false })
  })
})

describe('mandarRespaldoSiCorresponde (Meta frenó la invitación de marketing)', () => {
  const FALLO = { waMessageId: 'wamid.v4', estado: 'failed', codigoError: '131049' }
  beforeEach(() => {
    mem.fila = { ...encuestaDePrueba(), send_status: 'enviada', wa_message_id: 'wamid.v4', sent_to: '5491158234521', completed_at: null }
    datosMock.leerEncuestaPorMensaje.mockImplementation(async () => (mem.fila ? { ...encuestaConVisitaDePrueba(), encuesta: mem.fila } : null))
  })
  it('manda la v5 al mismo teléfono, con los mismos datos, y la encuesta pasa a apuntar al mensaje nuevo', async () => {
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.v5' })
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('mandado')
    const [envio, destino] = mandarMock.mock.calls[0]
    expect(envio.templateName).toBe('encuesta_visita_v3')
    expect(envio.bodyParams).toEqual(['Mariana', 'Doblas 248', '14/10', mem.fila?.token])
    expect(destino).toMatchObject({ telefono: '5491158234521', sentBy: null })
    expect(datosMock.registrarEnvio).toHaveBeenCalledWith(mem.fila?.id, expect.objectContaining({ send_status: 'enviada', wa_message_id: 'wamid.v5' }))
    expect(datosMock.liberarEnvio).toHaveBeenCalled()
  })
  it('si la v5 también falla, la encuesta queda "fallida" con el motivo (nunca "Enviada" mintiendo)', async () => {
    mandarMock.mockResolvedValue({ ok: false, error: 'boom', codigo: 131026 })
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('fallido')
    expect(datosMock.registrarEnvio).toHaveBeenCalledWith(mem.fila?.id, expect.objectContaining({ send_status: 'fallida' }))
  })
  it('un estado que no es fallo no toca la base (pasan cientos por el webhook)', async () => {
    expect(await mandarRespaldoSiCorresponde({ ...FALLO, estado: 'delivered' }, AHORA)).toBe('no_fallo')
    expect(datosMock.plantillaDelMensaje).not.toHaveBeenCalled()
    expect(mandarMock).not.toHaveBeenCalled()
  })
  it('reintento de Meta sobre el mensaje viejo después del respaldo: no duplica', async () => {
    mem.fila = { ...mem.fila!, wa_message_id: 'wamid.v5' }
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('ya_reemplazado')
    expect(mandarMock).not.toHaveBeenCalled()
  })
  it('carrera: otro reintento ya mandó el respaldo mientras esperaba el candado → al releer, no manda', async () => {
    // Revisión adversarial 2026-10-22: dos POST de Meta con el mismo "failed" en paralelo. El
    // segundo decidió con la encuesta vieja; con el candado ya tomado, la relectura lo frena.
    datosMock.leerEncuestaConVisita.mockImplementationOnce(async () => ({
      ...encuestaConVisitaDePrueba(), encuesta: { ...mem.fila!, wa_message_id: 'wamid.v5' },
    }))
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('ya_reemplazado')
    expect(mandarMock).not.toHaveBeenCalled()
    expect(datosMock.liberarEnvio).toHaveBeenCalled()
  })
  it('Meta mandó la v5 pero la base no la pudo guardar: deja el rastro con el mensaje nuevo', async () => {
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.v5' })
    datosMock.registrarEnvio.mockRejectedValueOnce(new Error('base caída'))
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('error')
    expect(errores.mock.calls.flat().join(' ')).toContain('wamid.v5')
    errores.mockRestore()
  })
  it('candado tomado (otro respaldo en curso): no manda', async () => {
    datosMock.reservarEnvio.mockResolvedValueOnce(false)
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('en_curso')
    expect(mandarMock).not.toHaveBeenCalled()
  })
  it('NUNCA lanza: si la base falla, devuelve "error" (el webhook tiene que responder 200 a Meta)', async () => {
    datosMock.plantillaDelMensaje.mockRejectedValueOnce(new Error('base caída'))
    expect(await mandarRespaldoSiCorresponde(FALLO, AHORA)).toBe('error')
  })
})
