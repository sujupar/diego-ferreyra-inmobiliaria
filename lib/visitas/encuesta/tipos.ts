/**
 * Catálogos y tipos de la encuesta post-visita (spec §11). Puro y seguro para el navegador.
 * Cada catálogo con CHECK en la base (migración 20261015000002) se compara con ese CHECK en
 * tipos.test.ts: se tocan JUNTOS o la base rechaza la escritura con 23514.
 */
import type { EstadoVisita } from '../transiciones'

export const PASOS_ENCUESTA = ['bienvenida', 'gusto', 'mas_gusto', 'menos_gusto', 'precio', 'oferta', 'contacto', 'gracias'] as const
export type PasoEncuesta = (typeof PASOS_ENCUESTA)[number]

/** Los pasos que se guardan uno por uno (PATCH). `contacto` va en el POST final. */
export const PASOS_GUARDABLES = ['gusto', 'mas_gusto', 'menos_gusto', 'precio', 'oferta'] as const
export type PasoGuardable = (typeof PASOS_GUARDABLES)[number]

export const OPINIONES_PRECIO = ['correcto', 'alto', 'bajo'] as const
export type OpinionPrecio = (typeof OPINIONES_PRECIO)[number]

export const MONEDAS = ['USD', 'ARS'] as const
export type Moneda = (typeof MONEDAS)[number]

/** Moneda de la propiedad para la oferta: lo que no es ARS se publica en dólares. */
export function monedaDe(currency: string | null | undefined): Moneda {
  return currency === 'ARS' ? 'ARS' : 'USD'
}

export const ESTADOS_ENVIO = ['sin_enviar', 'enviada', 'fallida', 'omitida'] as const
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number]

export const MOTIVOS_OMISION = [
  'envio_apagado', 'sin_regalo', 'telefono_invalido', 'plantilla_sin_configurar', 'plantilla_desconocida',
  'ajustes_ilegibles', 'modo_prueba_whatsapp', 'ya_respondio', 'vencida', 'ya_enviada',
] as const
export type MotivoOmision = (typeof MOTIVOS_OMISION)[number]

export const ESTADOS_AVISO = ['pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde'] as const
export type EstadoAviso = (typeof ESTADOS_AVISO)[number]

/** Los avisos que salen al completar, en el orden en que se intentan (lo más importante primero). */
export const CANALES_AVISO = ['equipo', 'regalo_whatsapp', 'regalo_email'] as const
export type CanalAviso = (typeof CANALES_AVISO)[number]

export const COLUMNAS_DE_CANAL: Readonly<Record<CanalAviso, {
  estado: 'team_notice_status' | 'gift_whatsapp_status' | 'gift_email_status'
  momento: 'team_notice_at' | 'gift_whatsapp_at' | 'gift_email_at'
}>> = {
  equipo: { estado: 'team_notice_status', momento: 'team_notice_at' },
  regalo_whatsapp: { estado: 'gift_whatsapp_status', momento: 'gift_whatsapp_at' },
  regalo_email: { estado: 'gift_email_status', momento: 'gift_email_at' },
}

export interface RespuestasEncuesta {
  liked: boolean | null
  most_liked_tags: string[]
  most_liked_other: string | null
  least_liked_tags: string[]
  least_liked_other: string | null
  price_opinion: OpinionPrecio | null
  offer_amount: number | null
  offer_currency: Moneda | null
  offer_declined: boolean | null
}

export const RESPUESTAS_VACIAS: RespuestasEncuesta = {
  liked: null, most_liked_tags: [], most_liked_other: null, least_liked_tags: [], least_liked_other: null,
  price_opinion: null, offer_amount: null, offer_currency: null, offer_declined: null,
}

export interface AjustesEncuesta {
  envio_automatico: boolean
  solo_con_regalo: boolean
  regalo_por_whatsapp: boolean
  telefonos_prueba: string[]
}

export interface RegaloDeLaPropiedad {
  propertyId: string
  titulo: string
  archivoPath: string
  archivoNombre: string
  archivoBytes: number
  portadaPath: string | null
  actualizadoEl: string
}

/**
 * El regalo GENERAL (2026-10-17): uno solo para todas las visitas, hoy la guía de gastos para
 * compradores. Mismo contenido que el de una propiedad, sin propiedad.
 */
export type RegaloGeneral = Omit<RegaloDeLaPropiedad, 'propertyId'>

export interface EncuestaFila extends RespuestasEncuesta {
  id: string
  visit_id: string
  token: string
  expires_at: string
  created_at: string
  updated_at: string
  send_status: EstadoEnvio
  send_skip_reason: MotivoOmision | null
  send_error: string | null
  sent_at: string | null
  sent_to: string | null
  wa_message_id: string | null
  opened_at: string | null
  open_count: number
  last_step: PasoGuardable | null
  completed_at: string | null
  contact_phone: string | null
  contact_email: string | null
  wants_similar: boolean | null
  team_notice_status: EstadoAviso
  gift_whatsapp_status: EstadoAviso
  gift_email_status: EstadoAviso
  gift_wa_message_id: string | null
  notice_attempts: number
  notice_error: string | null
  gift_downloaded_at: string | null
}

export interface PropiedadDeEncuesta {
  id: string
  address: string
  neighborhood: string | null
  photos: unknown
  asking_price: number | null
  currency: string | null
  property_type: string | null
  amenities: unknown
  garages: number | null
  floor: number | null
  expensas: number | null
}

export interface VisitaDeEncuesta {
  id: string
  property_id: string
  client_name: string
  client_phone: string | null
  scheduled_at: string
  status: EstadoVisita
  advisor_id: string | null
  lead_id: string | null
  propiedad: PropiedadDeEncuesta | null
}

export interface EncuestaConVisita {
  encuesta: EncuestaFila
  visita: VisitaDeEncuesta
}

/** Estado del mensaje de WhatsApp tal como lo mantiene el webhook en `whatsapp_messages`. */
export interface EstadoWa {
  status: string
  error_code: string | null
  error_message: string | null
}
