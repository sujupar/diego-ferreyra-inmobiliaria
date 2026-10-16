/**
 * Lo que dice la ficha de la visita sobre la encuesta (adenda §11.4), en castellano. Entregada /
 * Leída / Falló-después-de-aceptada salen del estado que el webhook mantiene en whatsapp_messages:
 * no se copian a otra tabla (dos fuentes del mismo dato terminan diciendo cosas distintas).
 * Puro y seguro para el navegador.
 */
import { estaVencida } from './link'
import type { EncuestaFila, EstadoWa, MotivoOmision } from './tipos'

export type ClaveEstadoEncuesta = 'respondida' | 'abierta' | 'vencida' | 'leida' | 'entregada' | 'enviada' | 'fallo' | 'sin_enviar'
export interface EstadoEncuestaVisible { clave: ClaveEstadoEncuesta; texto: string }

export const TEXTO_MOTIVO_OMISION: Readonly<Record<MotivoOmision, string>> = {
  envio_apagado: 'envío apagado',
  sin_regalo: 'la propiedad no tiene regalo',
  telefono_invalido: 'el teléfono no es un WhatsApp válido',
  plantilla_sin_configurar: 'falta configurar la plantilla',
  plantilla_desconocida: 'la plantilla configurada no es una de las conocidas',
  ajustes_ilegibles: 'no se pudieron leer los ajustes',
  modo_prueba_whatsapp: 'WhatsApp en modo prueba',
  ya_respondio: 'ya respondió',
  vencida: 'el link venció',
  ya_enviada: 'ya se había enviado',
}

/** Códigos de Meta que ya vimos en este proyecto (CLAUDE.md § WhatsApp), en palabras del equipo. */
const MOTIVOS_META: Readonly<Record<string, string>> = {
  '131026': 'el número no tiene WhatsApp o no puede recibir este mensaje',
  '131047': 'pasaron más de 24 h desde el último mensaje de la persona',
  '131049': 'Meta no lo entregó para no saturar a la persona con mensajes de empresas',
  '131050': 'la persona pidió no recibir mensajes de empresas',
  '131008': 'faltó un dato de la plantilla',
  '132000': 'la cantidad de datos no coincide con la plantilla',
  '132001': 'la plantilla no existe o todavía no está aprobada',
  '131056': 'demasiados mensajes seguidos a ese número',
  '130429': 'se llegó al límite de mensajes por segundo',
  '131048': 'se llegó al límite de mensajes de la cuenta',
  '80007': 'se llegó al límite de la cuenta de WhatsApp',
}

export function motivoLegibleDeMeta(codigo: string | number | null | undefined, mensaje: string | null | undefined): string {
  const c = codigo === null || codigo === undefined ? '' : String(codigo)
  if (c && Object.hasOwn(MOTIVOS_META, c)) return MOTIVOS_META[c]
  if (/abort|timeout/i.test(mensaje ?? '')) return 'WhatsApp no respondió a tiempo'
  if (c) return `WhatsApp rechazó el mensaje (código ${c})`
  return 'WhatsApp rechazó el mensaje'
}

export function estadoVisibleDeLaEncuesta(
  e: Pick<EncuestaFila, 'completed_at' | 'opened_at' | 'expires_at' | 'send_status' | 'send_skip_reason' | 'send_error'>,
  wa: EstadoWa | null,
  ahora: Date,
): EstadoEncuestaVisible {
  if (e.completed_at) return { clave: 'respondida', texto: 'Respondida' }
  if (e.opened_at) return { clave: 'abierta', texto: 'Abierta' }
  if (estaVencida(e.expires_at, ahora)) return { clave: 'vencida', texto: 'Venció sin respuesta' }
  switch (e.send_status) {
    case 'enviada':
      if (wa?.status === 'failed') return { clave: 'fallo', texto: `Falló: ${motivoLegibleDeMeta(wa.error_code, wa.error_message)}` }
      if (wa?.status === 'read') return { clave: 'leida', texto: 'Leída' }
      if (wa?.status === 'delivered') return { clave: 'entregada', texto: 'Entregada' }
      return { clave: 'enviada', texto: 'Enviada' }
    case 'fallida':
      return { clave: 'fallo', texto: `Falló: ${e.send_error ?? 'WhatsApp rechazó el mensaje'}` }
    case 'omitida':
      return { clave: 'sin_enviar', texto: e.send_skip_reason ? `Sin enviar (${TEXTO_MOTIVO_OMISION[e.send_skip_reason]})` : 'Sin enviar' }
    case 'sin_enviar':
      return { clave: 'sin_enviar', texto: 'Sin enviar' }
  }
}
