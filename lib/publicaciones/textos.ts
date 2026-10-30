/**
 * Límites de texto de las redes y controles sobre lo que escribe la IA.
 *
 * Los límites son los más estrictos entre las cuatro redes (Instagram corta la
 * descripción a 2.200 caracteres y 30 hashtags; YouTube, el título a 100 y sin
 * `<` ni `>`). Pasarse no "recorta" del lado de la red: rechaza la publicación.
 *
 * `problemasDeTexto` existe porque una IA que escribe captions de una inmobiliaria
 * tiende a inventar precios y teléfonos. Un número que Diego no dijo en el video
 * es un dato falso con su nombre abajo.
 */

export const LIMITES = { descripcion: 2200, hashtags: 30, tituloYoutube: 100 } as const

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu
const PRECIO_RE = /(?:U\$[SD]|USD|US\$|\$)\s?\d{1,3}(?:[.,]\d{3})+|(?:U\$[SD]|USD|US\$|\$)\s?\d+/gi
const TELEFONO_RE = /(?:\+?54\s?)?(?:9\s?)?\b\d{2,4}[\s-]?\d{4}[\s-]\d{4}\b|\b\d{10,13}\b/g

function recortarHashtags(texto: string): string {
  let vistos = 0
  return texto
    .replace(HASHTAG_RE, (tag) => (++vistos <= LIMITES.hashtags ? tag : ''))
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+$/gm, '')
}

function recortarPorFrase(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max)
  const finFrase = Math.max(
    corte.lastIndexOf('. '),
    corte.lastIndexOf('! '),
    corte.lastIndexOf('? '),
    corte.lastIndexOf('\n'),
    corte.endsWith('.') || corte.endsWith('!') || corte.endsWith('?') ? max - 1 : -1,
  )
  if (finFrase >= max / 2) return corte.slice(0, finFrase + 1).trimEnd()
  const espacio = corte.lastIndexOf(' ')
  return (espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd()
}

export function ajustarDescripcion(texto: string): string {
  const limpio = recortarHashtags(texto.normalize('NFC')).trim()
  return recortarPorFrase(limpio, LIMITES.descripcion)
}

export function ajustarTituloYoutube(texto: string): string {
  const limpio = texto.normalize('NFC').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  if (limpio.length <= LIMITES.tituloYoutube) return limpio
  const corte = limpio.slice(0, LIMITES.tituloYoutube + 1)
  const espacio = corte.lastIndexOf(' ')
  return (espacio > 0 ? corte.slice(0, espacio) : limpio.slice(0, LIMITES.tituloYoutube)).trim()
}

/** Números que aparecen en la transcripción, con los separadores de miles quitados. */
function numerosDe(texto: string): Set<string> {
  const sinMiles = texto.replace(/(\d)[.,](?=\d{3}\b)/g, '$1')
  return new Set(sinMiles.match(/\d+/g) ?? [])
}

function precioDicho(precio: string, transcripcion: string): boolean {
  const valor = Number(precio.replace(/\D/g, ''))
  if (!Number.isFinite(valor) || valor === 0) return true
  if (numerosDe(transcripcion).has(String(valor))) return true
  const t = transcripcion.toLowerCase()
  if (valor % 1_000_000 === 0 && new RegExp(`\\b${valor / 1_000_000}\\s*(millón|millones)`).test(t)) return true
  if (valor % 1000 === 0 && new RegExp(`\\b${valor / 1000}\\s*mil\\b`).test(t)) return true
  return false
}

function telefonoDicho(telefono: string, transcripcion: string): boolean {
  const ultimos = telefono.replace(/\D/g, '').slice(-8)
  return transcripcion.replace(/\D/g, '').includes(ultimos)
}

export function problemasDeTexto(descripcion: string, transcripcion: string): string[] {
  const problemas: string[] = []
  for (const precio of descripcion.match(PRECIO_RE) ?? []) {
    if (!precioDicho(precio, transcripcion)) problemas.push(`precio que no dijo Diego: ${precio.trim()}`)
  }
  for (const tel of descripcion.match(TELEFONO_RE) ?? []) {
    if (!telefonoDicho(tel, transcripcion)) problemas.push(`teléfono que no dijo Diego: ${tel.trim()}`)
  }
  return problemas
}
