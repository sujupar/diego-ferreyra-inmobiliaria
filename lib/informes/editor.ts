/**
 * Lógica pura de la pantalla del informe (sin React, para poder probarla con vitest): el aviso que
 * devuelve el scraper convertido en competidora, el rótulo de cada fuente automática y cuáles
 * quedan por traer.
 */
import type { ScrapedProperty } from '@/lib/scraper/types'
import { valorDelM2 } from './resumen'
import { TOPES_COMPETIDORA } from './sanear'
import { FUENTES, type Competidora, type DatosPorFuente, type FuenteGuardada, type Fuentes, type NombreFuente } from './tipos'

/** "Quesada 3250, Coghlan, Capital Federal" → dirección y barrio (lo que muestran los portales). */
export function separarUbicacion(ubicacion: string): { direccion: string; barrio: string | null } {
  const partes = ubicacion.split(',').map(p => p.trim()).filter(Boolean)
  return { direccion: partes[0] ?? '', barrio: partes[1] ?? null }
}

// Lo que el servidor rechazaría (un precio de miles de millones, un título larguísimo) se vacía o se
// recorta acá: si no, la lista entera quedaba sin poder guardarse por una sola competidora.
const numeroOVacio = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= TOPES_COMPETIDORA.numero ? v : null)
const textoOVacio = (v: unknown, tope: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, tope) : null)

/** La respuesta de `/api/scrape` viene de afuera: se revisa su forma antes de usarla. */
export function esAvisoDelScraper(v: unknown): v is ScrapedProperty {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.title === 'string' && typeof o.location === 'string' && Array.isArray(o.images)
    && !!o.features && typeof o.features === 'object'
}

/**
 * Lo que el portal no muestra queda en null —editable—, nunca en 0: un "0 baños" sale impreso en el
 * PDF que recibe el propietario. El valor del m² es una PROPUESTA (precio ÷ m² total): los ejemplos
 * de Diego usan a veces el m² homogeneizado y Paula lo corrige.
 */
export function competidoraDesdeAviso(url: string, aviso: ScrapedProperty): Competidora {
  const f = aviso.features
  const { direccion, barrio } = separarUbicacion(aviso.location ?? '')
  const m2 = numeroOVacio(f.totalArea) ?? numeroOVacio(f.coveredArea)
  const precio = numeroOVacio(aviso.price)
  // La foto va a un <img> y al PDF: solo https, como valida el servidor al guardar.
  const foto = aviso.images.find(i => i.startsWith('https://') && i.length <= TOPES_COMPETIDORA.link) ?? null
  return {
    url,
    direccion: (direccion || aviso.title.trim()).slice(0, TOPES_COMPETIDORA.direccion),
    barrio: barrio ? barrio.slice(0, TOPES_COMPETIDORA.barrio) : null,
    precio,
    moneda: aviso.currency,
    m2,
    valorM2: valorDelM2(precio, m2),
    ambientes: numeroOVacio(f.rooms),
    banos: numeroOVacio(f.bathrooms),
    dormitorios: numeroOVacio(f.bedrooms),
    antiguedad: numeroOVacio(f.age),
    cocheras: numeroOVacio(f.garages),
    foto,
    publicadoHace: textoOVacio(f.publishedDate, TOPES_COMPETIDORA.publicadoHace),
    visualizaciones: numeroOVacio(f.views),
    bajoDePrecio: false,
  }
}

/**
 * Un conteo tipeado a mano: "1.055" son mil cincuenta y cinco (así los copia Paula de los
 * paneles de los portales). Vacío = no cargado, que NO es lo mismo que 0.
 */
export function numeroDelCampo(texto: string): number | undefined {
  const digitos = texto.replace(/\D/g, '')
  return digitos ? Number(digitos) : undefined
}

export type Tono ='pendiente' | 'ok' | 'neutro' | 'error'

/** Una fuente caída se dice como tal ("No se pudo traer"), nunca como un cero (criterio 10). */
export function rotuloDeLaFuente(f: FuenteGuardada<unknown> | undefined): { texto: string; tono: Tono } {
  if (!f || f.estado === 'pendiente') return { texto: 'Por traer', tono: 'pendiente' }
  if (f.estado === 'ok') return { texto: 'Traído', tono: 'ok' }
  if (f.estado === 'sin_datos') return { texto: f.error ?? 'Sin datos en el período', tono: 'neutro' }
  return { texto: `No se pudo traer${f.error ? `: ${f.error}` : ''}`, tono: 'error' }
}

const miles = new Intl.NumberFormat('es-AR')
const plural = (n: number, uno: string, varios: string) => `${miles.format(n)} ${n === 1 ? uno : varios}`
const PORTALES: Array<[keyof DatosPorFuente['consultas']['porPortal'], string]> = [
  ['zonaprop', 'Zonaprop'], ['argenprop', 'Argenprop'], ['mercadolibre', 'MercadoLibre'], ['redes', 'Redes'], ['otros', 'Otros'],
]

/**
 * Una línea con lo que trajo cada fuente, para que Paula escriba los textos con los datos a la
 * vista. null si no hay datos (sin datos o error): el rótulo ya lo dice, acá no se inventa un cero.
 */
export function resumenDeLaFuente(nombre: NombreFuente, f: Fuentes): string | null {
  switch (nombre) {
    case 'consultas': {
      const d = f.consultas?.estado === 'ok' ? f.consultas.datos : null
      if (!d) return null
      const desglose = PORTALES.filter(([k]) => d.porPortal[k] > 0).map(([k, t]) => `${t} ${d.porPortal[k]}`)
      return `${plural(d.total, 'consulta', 'consultas')}${desglose.length ? ` (${desglose.join(', ')})` : ''}`
    }
    case 'visitas': {
      const d = f.visitas?.estado === 'ok' ? f.visitas.datos : null
      if (!d) return null
      return `${plural(d.realizadas, 'visita realizada', 'visitas realizadas')} · ${plural(d.ficha.respuestas, 'ficha completa', 'fichas completas')}`
    }
    case 'reserva': {
      const d = f.reserva?.estado === 'ok' ? f.reserva.datos : null
      if (!d) return null
      return d.reservada ? 'Reservada' : 'Sin reserva en el período'
    }
    case 'mercadolibre': {
      const d = f.mercadolibre?.estado === 'ok' ? f.mercadolibre.datos : null
      if (!d) return null
      const partes = [`${plural(d.visitas, 'visita', 'visitas')} al aviso ${d.avisoId}`]
      if (d.contactos) {
        const c = d.contactos
        const canales = ([[c.preguntas, 'pregunta', 'preguntas'], [c.whatsapp, 'WhatsApp', 'WhatsApp'], [c.llamadas, 'llamada', 'llamadas'], [c.otros, 'otro', 'otros']] as const)
          .filter(([n]) => n > 0).map(([n, uno, varios]) => plural(n, uno, varios))
        partes.push(`${plural(c.interesados, 'interesado', 'interesados')}${canales.length ? ` (${canales.join(', ')})` : ''}`)
      }
      if (typeof d.vistasTelefono === 'number' && d.vistasTelefono > 0) partes.push(`vieron el teléfono ${plural(d.vistasTelefono, 'vez', 'veces')}`)
      return partes.join(' · ')
    }
    case 'meta': {
      const d = f.meta?.estado === 'ok' ? f.meta.datos : null
      if (!d) return null
      return `${plural(d.campanas, 'campaña', 'campañas')} · alcance ${miles.format(d.alcance)} · ${plural(d.resultados, 'cliente potencial', 'clientes potenciales')}`
    }
    case 'instagram': {
      const d = f.instagram?.estado === 'ok' ? f.instagram.datos : null
      if (!d) return null
      const reproducciones = d.reels.reduce((a, r) => a + r.reproducciones, 0)
      return `${plural(d.reels.length, 'reel', 'reels')} · ${miles.format(reproducciones)} reproducciones (acumulado desde que se publicó)`
    }
  }
}

/** Las que la pantalla pide sola al abrir el borrador (una por pedido). Las con error se reintentan a mano. */
export function fuentesPorTraer(f: Fuentes): NombreFuente[] {
  return FUENTES.filter(n => !f[n] || f[n]?.estado === 'pendiente')
}
