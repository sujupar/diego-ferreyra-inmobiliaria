import { describe, it, expect } from 'vitest'
import { decidirEnvioEncuesta, decidirRegaloPorWhatsapp, esTelefonoDePrueba, type EntradaEnvioEncuesta } from './envio'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const normalizar = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `549${d.slice(-10)}` : null
}
const base: EntradaEnvioEncuesta = {
  ajustes: { ...AJUSTES_PRUEBA, envio_automatico: true }, tieneRegalo: true, telefono: '+5491158234521',
  plantilla: 'encuesta_visita_v1', yaEnviada: false, reenvio: false, completada: false, vencida: false,
}

describe('decidirEnvioEncuesta (adenda §11.4, en ese orden)', () => {
  it('todo en orden: manda', () => {
    expect(decidirEnvioEncuesta(base, normalizar)).toEqual({ enviar: true, telefono: '5491158234521', esPrueba: false })
  })
  it.each([
    ['ajustes ilegibles', { ajustes: null }, 'ajustes_ilegibles'],
    ['ya respondida', { completada: true }, 'ya_respondio'],
    ['vencida', { vencida: true }, 'vencida'],
    ['teléfono inválido', { telefono: '123' }, 'telefono_invalido'],
    ['sin teléfono', { telefono: null }, 'telefono_invalido'],
    ['envío apagado', { ajustes: { ...AJUSTES_PRUEBA, envio_automatico: false } }, 'envio_apagado'],
    ['sin regalo con "solo con regalo"', { tieneRegalo: false }, 'sin_regalo'],
    ['sin plantilla', { plantilla: null }, 'plantilla_sin_configurar'],
    ['plantilla desconocida', { plantilla: 'encuesta_visita_v9' }, 'plantilla_desconocida'],
    ['ya enviada', { yaEnviada: true }, 'ya_enviada'],
  ] as const)('%s → no manda', (_n, cambios, motivo) => {
    expect(decidirEnvioEncuesta({ ...base, ...cambios }, normalizar)).toEqual({ enviar: false, motivo })
  })
  it('"solo con regalo" apagado manda aunque no haya regalo', () => {
    const e = { ...base, tieneRegalo: false, ajustes: { ...AJUSTES_PRUEBA, envio_automatico: true, solo_con_regalo: false } }
    expect(decidirEnvioEncuesta(e, normalizar).enviar).toBe(true)
  })
  it('un teléfono de prueba saltea el interruptor y el regalo, pero no la plantilla', () => {
    const prueba = { ...AJUSTES_PRUEBA, envio_automatico: false, telefonos_prueba: ['11 5823-4521'] }
    expect(decidirEnvioEncuesta({ ...base, ajustes: prueba, tieneRegalo: false }, normalizar))
      .toEqual({ enviar: true, telefono: '5491158234521', esPrueba: true })
    expect(decidirEnvioEncuesta({ ...base, ajustes: prueba, plantilla: null }, normalizar))
      .toEqual({ enviar: false, motivo: 'plantilla_sin_configurar' })
  })
  it('un reenvío pedido a mano pasa aunque ya se haya enviado', () => {
    expect(decidirEnvioEncuesta({ ...base, yaEnviada: true, reenvio: true }, normalizar).enviar).toBe(true)
  })
})

describe('esTelefonoDePrueba', () => {
  it('compara por los últimos 10 dígitos (con o sin 9, con o sin +54)', () => {
    expect(esTelefonoDePrueba('5491158234521', ['+54 11 5823-4521'])).toBe(true)
    expect(esTelefonoDePrueba('5491158234521', ['1158234522'])).toBe(false)
    expect(esTelefonoDePrueba('5491158234521', ['', '123'])).toBe(false)
  })
})

describe('decidirRegaloPorWhatsapp', () => {
  const r = { ajustes: { ...AJUSTES_PRUEBA, regalo_por_whatsapp: true }, tieneRegalo: true, telefono: '+5491158234521', plantilla: 'regalo_visita_v1', yaEnviado: false }
  it('todo en orden: manda', () => {
    expect(decidirRegaloPorWhatsapp(r, normalizar)).toEqual({ enviar: true, telefono: '5491158234521', esPrueba: false })
  })
  it.each([
    ['apagado', { ajustes: AJUSTES_PRUEBA }, 'apagado'],
    ['sin regalo', { tieneRegalo: false }, 'sin_regalo'],
    ['sin plantilla', { plantilla: null }, 'plantilla_sin_configurar'],
    ['plantilla de la encuesta en vez de la del regalo', { plantilla: 'encuesta_visita_v1' }, 'plantilla_desconocida'],
    ['ya enviado', { yaEnviado: true }, 'ya_enviado'],
    ['ajustes ilegibles', { ajustes: null }, 'ajustes_ilegibles'],
  ] as const)('%s → no manda', (_n, cambios, motivo) => {
    expect(decidirRegaloPorWhatsapp({ ...r, ...cambios }, normalizar)).toEqual({ enviar: false, motivo })
  })
  it('un teléfono de prueba lo recibe con el interruptor apagado (para probar sin prenderlo para todos)', () => {
    const prueba = { ...AJUSTES_PRUEBA, telefonos_prueba: ['5491158234521'] }
    expect(decidirRegaloPorWhatsapp({ ...r, ajustes: prueba }, normalizar).enviar).toBe(true)
  })
})
