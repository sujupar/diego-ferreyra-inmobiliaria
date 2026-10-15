import { describe, it, expect } from 'vitest'
import { estadoVisibleDeLaEncuesta, motivoLegibleDeMeta } from './estado-envio'
import { encuestaDePrueba } from '@/test/visitas/encuesta-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const enviada = encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-15T14:00:00Z', wa_message_id: 'wamid.1' })

describe('estadoVisibleDeLaEncuesta (adenda §11.4)', () => {
  it('sin enviar con su motivo', () => {
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba({ send_status: 'omitida', send_skip_reason: 'envio_apagado' }), null, AHORA))
      .toEqual({ clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' })
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba({ send_status: 'omitida', send_skip_reason: 'modo_prueba_whatsapp' }), null, AHORA).texto)
      .toBe('Sin enviar (WhatsApp en modo prueba)')
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba(), null, AHORA)).toEqual({ clave: 'sin_enviar', texto: 'Sin enviar' })
  })
  it('enviada → entregada → leída según el webhook', () => {
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'accepted', error_code: null, error_message: null }, AHORA).texto).toBe('Enviada')
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'delivered', error_code: null, error_message: null }, AHORA).texto).toBe('Entregada')
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'read', error_code: null, error_message: null }, AHORA).texto).toBe('Leída')
  })
  it('Meta la rechazó DESPUÉS de aceptarla (webhook "failed"): falla, en castellano', () => {
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'failed', error_code: '131026', error_message: 'Message undeliverable' }, AHORA))
      .toEqual({ clave: 'fallo', texto: 'Falló: el número no tiene WhatsApp o no puede recibir este mensaje' })
  })
  it('falló al mandar: el motivo guardado', () => {
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba({ send_status: 'fallida', send_error: 'la plantilla no existe o todavía no está aprobada' }), null, AHORA).texto)
      .toBe('Falló: la plantilla no existe o todavía no está aprobada')
  })
  it('abierta y respondida mandan sobre el envío; vencida sin responder lo dice', () => {
    expect(estadoVisibleDeLaEncuesta({ ...enviada, opened_at: '2026-10-15T14:30:00Z' }, null, AHORA).clave).toBe('abierta')
    expect(estadoVisibleDeLaEncuesta({ ...enviada, completed_at: '2026-10-15T14:40:00Z' }, null, AHORA).clave).toBe('respondida')
    expect(estadoVisibleDeLaEncuesta({ ...enviada, expires_at: '2026-10-01T00:00:00Z' }, null, AHORA))
      .toEqual({ clave: 'vencida', texto: 'Venció sin respuesta' })
  })
})

describe('motivoLegibleDeMeta', () => {
  it.each([
    ['131047', null, 'pasaron más de 24 h desde el último mensaje de la persona'],
    [131008, null, 'faltó un dato de la plantilla'],
    ['132001', null, 'la plantilla no existe o todavía no está aprobada'],
    [null, 'The operation was aborted due to timeout', 'WhatsApp no respondió a tiempo'],
    ['999', 'algo raro', 'WhatsApp rechazó el mensaje (código 999)'],
    [null, null, 'WhatsApp rechazó el mensaje'],
  ])('%s / %s', (codigo, mensaje, esperado) => {
    expect(motivoLegibleDeMeta(codigo, mensaje)).toBe(esperado)
  })
})
