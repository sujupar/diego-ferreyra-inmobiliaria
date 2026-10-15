/**
 * Lo que ve el equipo de la encuesta en la ficha de la visita (spec §3.3 "Realizada: ver/copiar/
 * reenviar encuesta; ver respuestas" + adenda §11.4). Puro y seguro para el navegador: la ficha es
 * un componente de cliente que recibe esto por JSON.
 *
 * Los eventos de la encuesta se ARMAN desde la fila (no se agregan valores al CHECK de
 * property_visit_events.kind): son derivados, y si se guardaran aparte podrían contradecirla.
 */
import type { EventoVisitaR } from '../tipos'
import { estadoVisibleDeLaEncuesta, type EstadoEncuestaVisible } from './estado-envio'
import { estaVencida, urlDeLaEncuesta } from './link'
import { etiquetaDeOpcion, OTRA } from './opciones'
import { textoMonto } from './oferta'
import { pasoRespondido } from './pasos'
import { PASOS_GUARDABLES, type EncuestaFila, type EstadoWa, type OpinionPrecio } from './tipos'

export const TEXTO_PRECIO: Readonly<Record<OpinionPrecio, string>> = {
  correcto: 'Le parece correcto', alto: 'Le parece alto', bajo: 'Le parece bajo',
}

export interface RespuestasParaFicha {
  completa: boolean
  leGusto: boolean | null
  masGusto: string[]
  menosGusto: string[]
  precio: string | null
  oferta: string | null
  quiereSimilares: boolean | null
  telefono: string | null
  email: string | null
}

export interface EncuestaParaFicha {
  link: string
  /** `false` con la visita reabierta (ronda 1 de revisión): la ficha no ofrece "Copiar link" de
   * algo que ya no corresponde a una visita realizada. */
  linkDisponible: boolean
  estado: EstadoEncuestaVisible
  puedeReenviar: boolean
  vencida: boolean
  venceEl: string
  respondidaEl: string | null
  respuestas: RespuestasParaFicha | null
  eventos: EventoVisitaR[]
}

function etiquetas(tags: readonly string[], otra: string | null): string[] {
  const lista = tags.filter(t => t !== OTRA).map(etiquetaDeOpcion)
  return otra ? [...lista, `Otra: ${otra}`] : lista
}

export function respuestasParaFicha(e: EncuestaFila): RespuestasParaFicha | null {
  const completa = e.completed_at !== null
  if (!completa && !PASOS_GUARDABLES.some(p => pasoRespondido(p, e))) return null
  return {
    completa,
    leGusto: e.liked,
    masGusto: etiquetas(e.most_liked_tags, e.most_liked_other),
    menosGusto: etiquetas(e.least_liked_tags, e.least_liked_other),
    precio: e.price_opinion ? TEXTO_PRECIO[e.price_opinion] : null,
    oferta: e.offer_declined ? 'Prefirió no decirlo'
      : e.offer_amount !== null ? textoMonto(e.offer_amount, e.offer_currency ?? 'USD') : null,
    quiereSimilares: e.wants_similar,
    telefono: e.contact_phone,
    email: e.contact_email,
  }
}

const siNo = (v: boolean | null) => (v === null ? '—' : v ? 'Sí' : 'No')
const lista = (v: string[]) => (v.length ? v.join(', ') : '—')

/** Las respuestas como filas "etiqueta: valor". Las usan la ficha de la visita y el email al equipo. */
export function filasDeRespuestas(r: RespuestasParaFicha): Array<{ etiqueta: string; valor: string }> {
  const filas = [
    { etiqueta: '¿Le gustó?', valor: siNo(r.leGusto) },
    { etiqueta: 'Lo que más le gustó', valor: lista(r.masGusto) },
    { etiqueta: 'Lo que menos le gustó', valor: lista(r.menosGusto) },
    { etiqueta: 'El precio', valor: r.precio ?? '—' },
    { etiqueta: 'Cuánto ofertaría', valor: r.oferta ?? '—' },
    { etiqueta: 'Avisarle si entra algo parecido', valor: siNo(r.quiereSimilares) },
  ]
  if (r.telefono) filas.push({ etiqueta: 'WhatsApp', valor: r.telefono })
  if (r.email) filas.push({ etiqueta: 'Email', valor: r.email })
  return filas
}

export const KINDS_DE_ENCUESTA = ['encuesta_enviada', 'encuesta_abierta', 'encuesta_respondida'] as const

const SIN_DETALLE = {
  from_status: null, to_status: null, from_scheduled_at: null, to_scheduled_at: null,
  reason: null, note: null, actor: null, desde_asesor: null, hacia_asesor: null,
} as const

export function eventosDeLaEncuesta(e: Pick<EncuestaFila, 'id' | 'send_status' | 'sent_at' | 'opened_at' | 'completed_at'>): EventoVisitaR[] {
  const ev: EventoVisitaR[] = []
  if (e.send_status === 'enviada' && e.sent_at) ev.push({ ...SIN_DETALLE, id: `encuesta-enviada-${e.id}`, kind: 'encuesta_enviada', created_at: e.sent_at })
  if (e.opened_at) ev.push({ ...SIN_DETALLE, id: `encuesta-abierta-${e.id}`, kind: 'encuesta_abierta', created_at: e.opened_at })
  if (e.completed_at) ev.push({ ...SIN_DETALLE, id: `encuesta-respondida-${e.id}`, kind: 'encuesta_respondida', created_at: e.completed_at })
  return ev
}

/** Historial de la base + eventos de la encuesta, en orden. Saca los de encuesta previos: al refrescar no se duplican. */
export function mezclarEventos(historial: readonly EventoVisitaR[], deEncuesta: readonly EventoVisitaR[]): EventoVisitaR[] {
  return [...historial.filter(e => !(KINDS_DE_ENCUESTA as readonly string[]).includes(e.kind)), ...deEncuesta]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
}

export function armarEncuestaParaFicha(
  e: EncuestaFila,
  x: { wa: EstadoWa | null; puedeReenviar: boolean; linkDisponible: boolean; ahora: Date; base: string },
): EncuestaParaFicha {
  return {
    link: urlDeLaEncuesta(e.token, x.base),
    linkDisponible: x.linkDisponible,
    estado: estadoVisibleDeLaEncuesta(e, x.wa, x.ahora),
    puedeReenviar: x.puedeReenviar,
    vencida: e.completed_at === null && estaVencida(e.expires_at, x.ahora),
    venceEl: e.expires_at,
    respondidaEl: e.completed_at,
    respuestas: respuestasParaFicha(e),
    eventos: eventosDeLaEncuesta(e),
  }
}
