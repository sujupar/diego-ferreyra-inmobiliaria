/**
 * Estado del reproductor de la encuesta (patrones de openform/form-player, sin framer-motion):
 * un reductor PURO que se testea sin navegador. La pantalla solo despacha y pinta.
 * `animar` arranca en false: la primera pantalla se pinta tal cual sale del servidor (nunca
 * contenido esperando al JS); la animación existe recién desde el primer cambio de paso.
 */
import { formatearMiles, parsearMonto } from '@/lib/properties/money-input'
import { MAX_OPCIONES, NADA, OTRA } from './opciones'
import { pasoAnterior, pasoSiguiente } from './pasos'
import { urlDescargaDelRegalo, type EncuestaPublica } from './publica'
import { PASOS_ENCUESTA, type OpinionPrecio, type PasoEncuesta, type RespuestasEncuesta } from './tipos'

export interface ContactoBorrador {
  cambiarTelefono: boolean
  telefono: string
  email: string
  similares: boolean
  /** Honeypot: queda vacío para una persona. */
  empresa: string
}

export interface EstadoReproductor {
  paso: PasoEncuesta
  respuestas: RespuestasEncuesta
  ofertaTexto: string
  contacto: ContactoBorrador
  animar: boolean
  ocupado: boolean
  error: string | null
  descarga: string | null
}

export type AccionReproductor =
  | { tipo: 'empezar' }
  | { tipo: 'elegir_gusto'; valor: boolean }
  | { tipo: 'alternar'; paso: 'mas_gusto' | 'menos_gusto'; clave: string }
  | { tipo: 'escribir_otra'; paso: 'mas_gusto' | 'menos_gusto'; texto: string }
  | { tipo: 'elegir_precio'; valor: OpinionPrecio }
  | { tipo: 'escribir_oferta'; texto: string }
  | { tipo: 'atajo_oferta'; monto: number }
  | { tipo: 'declinar_oferta' }
  | { tipo: 'contacto'; cambios: Partial<ContactoBorrador> }
  | { tipo: 'ocupado' }
  | { tipo: 'avanzar' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ir_a'; paso: PasoEncuesta; mensaje?: string }
  | { tipo: 'atras' }
  | { tipo: 'terminado'; descarga: string | null }

export function esPasoEncuesta(v: unknown): v is PasoEncuesta {
  return typeof v === 'string' && (PASOS_ENCUESTA as readonly string[]).includes(v)
}

export function estadoInicial(e: EncuestaPublica): EstadoReproductor {
  return {
    paso: e.pasoInicial,
    respuestas: e.respuestas,
    ofertaTexto: e.respuestas.offer_amount ? formatearMiles(String(e.respuestas.offer_amount)) : '',
    contacto: { cambiarTelefono: e.telefonoEnmascarado === null, telefono: '', email: '', similares: false, empresa: '' },
    animar: false,
    ocupado: false,
    error: null,
    descarga: e.completa && e.regalo ? urlDescargaDelRegalo(e.token) : null,
  }
}

/** "Nada en especial" va sola (el servidor también lo exige); tope de 8. */
export function alternarEtiqueta(sel: readonly string[], clave: string): string[] {
  if (sel.includes(clave)) return sel.filter(c => c !== clave)
  if (clave === NADA) return [NADA]
  const sinNada = sel.filter(c => c !== NADA)
  return sinNada.length >= MAX_OPCIONES ? sinNada : [...sinNada, clave]
}

export function reducir(s: EstadoReproductor, a: AccionReproductor): EstadoReproductor {
  const r = s.respuestas
  switch (a.tipo) {
    case 'empezar':
      return { ...s, paso: 'gusto', animar: true, error: null }
    case 'elegir_gusto':
      return { ...s, respuestas: { ...r, liked: a.valor }, error: null }
    case 'alternar': {
      if (a.paso === 'mas_gusto') {
        const tags = alternarEtiqueta(r.most_liked_tags, a.clave)
        return { ...s, error: null, respuestas: { ...r, most_liked_tags: tags, most_liked_other: tags.includes(OTRA) ? r.most_liked_other : null } }
      }
      const tags = alternarEtiqueta(r.least_liked_tags, a.clave)
      return { ...s, error: null, respuestas: { ...r, least_liked_tags: tags, least_liked_other: tags.includes(OTRA) ? r.least_liked_other : null } }
    }
    case 'escribir_otra':
      return a.paso === 'mas_gusto'
        ? { ...s, error: null, respuestas: { ...r, most_liked_other: a.texto } }
        : { ...s, error: null, respuestas: { ...r, least_liked_other: a.texto } }
    case 'elegir_precio':
      return { ...s, respuestas: { ...r, price_opinion: a.valor }, error: null }
    case 'escribir_oferta': {
      const texto = formatearMiles(a.texto)
      return { ...s, ofertaTexto: texto, respuestas: { ...r, offer_amount: parsearMonto(texto), offer_declined: false }, error: null }
    }
    case 'atajo_oferta':
      return { ...s, ofertaTexto: formatearMiles(String(a.monto)), respuestas: { ...r, offer_amount: a.monto, offer_declined: false }, error: null }
    case 'declinar_oferta':
      return { ...s, ofertaTexto: '', respuestas: { ...r, offer_amount: null, offer_declined: true }, error: null }
    case 'contacto':
      return { ...s, contacto: { ...s.contacto, ...a.cambios }, error: null }
    case 'ocupado':
      return { ...s, ocupado: true, error: null }
    case 'avanzar':
      return { ...s, paso: pasoSiguiente(s.paso), ocupado: false, animar: true, error: null }
    case 'error':
      return { ...s, ocupado: false, error: a.mensaje }
    case 'ir_a':
      return { ...s, paso: a.paso, ocupado: false, animar: true, error: a.mensaje ?? null }
    case 'atras': {
      const p = pasoAnterior(s.paso)
      return p ? { ...s, paso: p, animar: true, error: null } : s
    }
    case 'terminado':
      return { ...s, paso: 'gracias', ocupado: false, animar: true, error: null, descarga: a.descarga }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function puedeAvanzar(s: EstadoReproductor, conTelefonoPrecargado: boolean): boolean {
  const r = s.respuestas
  const conOtra = (tags: string[], otra: string | null) => tags.length > 0 && (!tags.includes(OTRA) || (otra ?? '').trim().length >= 2)
  switch (s.paso) {
    case 'gusto': return r.liked !== null
    case 'mas_gusto': return conOtra(r.most_liked_tags, r.most_liked_other)
    case 'menos_gusto': return conOtra(r.least_liked_tags, r.least_liked_other)
    case 'precio': return r.price_opinion !== null
    case 'oferta': return r.offer_amount !== null || r.offer_declined === true
    case 'contacto': {
      const tel = (!s.contacto.cambiarTelefono && conTelefonoPrecargado) || s.contacto.telefono.replace(/\D/g, '').length >= 8
      const email = s.contacto.email.trim()
      return tel && (email === '' || EMAIL_RE.test(email))
    }
    case 'bienvenida':
    case 'gracias':
      return true
  }
}

export type CuerpoPasoCliente =
  | { paso: 'gusto'; valor: boolean }
  | { paso: 'mas_gusto' | 'menos_gusto'; etiquetas: string[]; otra: string | null }
  | { paso: 'precio'; valor: OpinionPrecio }
  | { paso: 'oferta'; monto: number | null; declina: boolean }

export function cuerpoDelPaso(s: EstadoReproductor): CuerpoPasoCliente | null {
  const r = s.respuestas
  switch (s.paso) {
    case 'gusto': return r.liked === null ? null : { paso: 'gusto', valor: r.liked }
    case 'mas_gusto': return { paso: 'mas_gusto', etiquetas: r.most_liked_tags, otra: r.most_liked_other }
    case 'menos_gusto': return { paso: 'menos_gusto', etiquetas: r.least_liked_tags, otra: r.least_liked_other }
    case 'precio': return r.price_opinion === null ? null : { paso: 'precio', valor: r.price_opinion }
    case 'oferta': return { paso: 'oferta', monto: r.offer_declined ? null : r.offer_amount, declina: r.offer_declined === true }
    default: return null
  }
}

export function cuerpoFinalDelEstado(s: EstadoReproductor): { telefono: string | null; email: string | null; similares: boolean; empresa: string } {
  return {
    telefono: s.contacto.cambiarTelefono ? s.contacto.telefono.trim() || null : null,
    email: s.contacto.email.trim() || null,
    similares: s.contacto.similares,
    empresa: s.contacto.empresa,
  }
}
