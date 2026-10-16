/**
 * Lo que recibe la página pública de la encuesta (spec §4.10 + adenda §11.3): SOLO nombre de pila,
 * dirección/barrio, una foto, precio y el teléfono enmascarado. Nunca apellido, email, teléfono
 * entero, asesor ni datos de otros visitantes. Puro: se testea qué SALE, no cómo se lee.
 */
import { opcionesDeLaEncuesta, type OpcionesDeLaEncuesta } from './opciones'
import { nombreDePila } from './plantillas'
import { enmascararTelefono } from './contacto'
import { pasoParaRetomar } from './pasos'
import { estaVencida } from './link'
import { monedaDe, type EncuestaConVisita, type Moneda, type PasoEncuesta, type PropiedadDeEncuesta, type RespuestasEncuesta } from './tipos'

/** Las opciones de ESA propiedad. Las usan la página (para mostrar) y la ruta (para validar). */
export function opcionesDeLaPropiedad(p: PropiedadDeEncuesta | null): OpcionesDeLaEncuesta {
  return opcionesDeLaEncuesta({
    property_type: p?.property_type ?? null, amenities: p?.amenities ?? [], garages: p?.garages ?? null,
    floor: p?.floor ?? null, expensas: p?.expensas ?? null,
  })
}

/**
 * MISMA lista que `images.remotePatterns` de next.config.ts (hay un test que las compara):
 * next/image rechaza cualquier otro host y la bienvenida quedaría con una imagen rota.
 */
export const HOSTS_EXACTOS = ['mncsnastmcjdjxrehdep.supabase.co'] as const
export const SUFIJOS_DE_HOSTS = ['.zonaprop.com.ar', '.naventcdn.com', '.argenprop.com', '.mlstatic.com'] as const

/** Host comparado EXACTO o por sufijo con punto: nunca `includes` (zonaprop.com.ar.evil.com). */
export function fotoParaEncuesta(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null
  for (const f of photos) {
    if (typeof f !== 'string') continue
    let url: URL
    try { url = new URL(f) } catch { continue }
    if (url.protocol !== 'https:') continue
    const h = url.hostname
    if ((HOSTS_EXACTOS as readonly string[]).includes(h) || SUFIJOS_DE_HOSTS.some(s => h.endsWith(s))) return f
  }
  return null
}

export interface EncuestaPublica {
  token: string
  /** Nombre de pila; '' si no hay (la pantalla saluda sin nombre). */
  nombre: string
  direccion: string
  barrio: string | null
  foto: string | null
  precio: number | null
  moneda: Moneda
  telefonoEnmascarado: string | null
  opciones: OpcionesDeLaEncuesta
  regalo: { titulo: string; portada: string | null } | null
  /** La encuesta promete "te lo mandamos por WhatsApp" SOLO si ese envío va a ocurrir. */
  regaloPorWhatsapp: boolean
  emailDejado: boolean
  respuestas: RespuestasEncuesta
  pasoInicial: PasoEncuesta
  completa: boolean
}

export type ResultadoEncuestaPublica =
  | { tipo: 'disponible'; encuesta: EncuestaPublica }
  | { tipo: 'vencida' }
  | { tipo: 'no_disponible' }

export interface ExtraPublica {
  regalo: { titulo: string; portada: string | null } | null
  regaloPorWhatsapp: boolean
  ahora: Date
}

export function urlDescargaDelRegalo(token: string): string {
  return `/api/public/encuesta/${token}/regalo`
}

export function armarEncuestaPublica(ec: EncuestaConVisita | null, x: ExtraPublica): ResultadoEncuestaPublica {
  // Visita reabierta (se marcó "Se realizó" por error): el link deja de servir hasta que se vuelva a marcar.
  if (!ec || ec.visita.status !== 'completed') return { tipo: 'no_disponible' }
  const { encuesta: e, visita: v } = ec
  const completa = e.completed_at !== null
  if (!completa && estaVencida(e.expires_at, x.ahora)) return { tipo: 'vencida' }
  const p = v.propiedad
  const respuestas: RespuestasEncuesta = {
    liked: e.liked, most_liked_tags: e.most_liked_tags, most_liked_other: e.most_liked_other,
    least_liked_tags: e.least_liked_tags, least_liked_other: e.least_liked_other,
    price_opinion: e.price_opinion, offer_amount: e.offer_amount, offer_currency: e.offer_currency,
    offer_declined: e.offer_declined,
  }
  const precio = p?.asking_price && p.asking_price > 0 ? p.asking_price : null
  return {
    tipo: 'disponible',
    encuesta: {
      token: e.token,
      nombre: nombreDePila(v.client_name, ''),
      direccion: p?.address?.trim() || 'la propiedad',
      barrio: p?.neighborhood?.trim() || null,
      foto: fotoParaEncuesta(p?.photos),
      precio,
      moneda: monedaDe(p?.currency),
      telefonoEnmascarado: enmascararTelefono(e.contact_phone ?? v.client_phone),
      opciones: opcionesDeLaPropiedad(p),
      regalo: x.regalo,
      regaloPorWhatsapp: x.regaloPorWhatsapp,
      emailDejado: completa && !!e.contact_email,
      respuestas,
      pasoInicial: pasoParaRetomar(respuestas, completa),
      completa,
    },
  }
}
