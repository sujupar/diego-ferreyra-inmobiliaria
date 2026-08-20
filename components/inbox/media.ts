/**
 * Qué archivo lleva un mensaje, resuelto desde lo que haya.
 *
 * POR QUÉ EXISTE: en el chat del Inbox el equipo veía `[Foto]
 * https://imgar.zonapropcdn.com/avisos/1/00/59/11/46/63/1200x1200/2052942732.jpg`
 * mientras el cliente veía la foto. Un asesor no puede seguir una conversación
 * leyendo URLs, y encima no tiene forma de saber qué le llegó de verdad.
 *
 * El componente ya sabía dibujar imágenes y videos, pero decidía por
 * `media_mime_type`, que en los mensajes SALIENTES viene vacío: los manda
 * `sendWhatsappMedia` con la URL y el tipo, no con el mime. Con el mime en
 * blanco, una foto caía en la rama de "documento" y se dibujaba como un link.
 *
 * Este módulo resuelve por prioridad, y esa cascada es el punto:
 *
 *   1. `media_type` — la columna SEMÁNTICA ('image' | 'video' | 'document').
 *      Es la que escriben los envíos y la que no depende de adivinar nada.
 *   2. `media_mime_type` — la traen los ENTRANTES, que llegan de Meta con su
 *      mime real.
 *   3. La extensión de la URL — último recurso.
 *   4. El PREFIJO del texto (`[Foto] …`, `[Video] …`, `[Documento] …`) — es lo
 *      único que tienen los mensajes anteriores al 6 de agosto de 2026, cuando
 *      los envíos empezaron a guardar las columnas. Sin esto, todo el historial
 *      seguiría viéndose como texto crudo, y migrar datos viejos para arreglar
 *      una pantalla es mucho más caro y más riesgoso que leerlos bien.
 *
 * Puro y sin dependencias: se testea sin DOM y sin red.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'document'

export interface MediaResuelto {
  tipo: MediaKind
  /**
   * `null` cuando sabemos que se mandó un archivo pero no tenemos con qué
   * mostrarlo (mensajes viejos que solo guardaron el nombre). Se dibuja igual,
   * como ficha sin link: "se mandó un documento" es información útil; una URL
   * suelta en pantalla no lo es.
   */
  url: string | null
  filename: string | null
  /** Texto que acompañaba al archivo. Nunca una URL. */
  caption: string | null
}

export interface MensajeConMedia {
  body_preview: string | null
  media_url: string | null
  media_mime_type: string | null
  media_filename: string | null
  media_type: string | null
}

const ETIQUETAS: Record<string, MediaKind> = {
  foto: 'image',
  fotos: 'image',
  imagen: 'image',
  image: 'image',
  video: 'video',
  audio: 'audio',
  documento: 'document',
  document: 'document',
  archivo: 'document',
}

const POR_EXTENSION: Array<{ re: RegExp; tipo: MediaKind }> = [
  { re: /\.(jpe?g|png|gif|webp|heic|bmp)(\?|#|$)/i, tipo: 'image' },
  { re: /\.(mp4|mov|m4v|3gp|webm|avi)(\?|#|$)/i, tipo: 'video' },
  { re: /\.(mp3|ogg|oga|wav|m4a|aac|opus)(\?|#|$)/i, tipo: 'audio' },
  { re: /\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt)(\?|#|$)/i, tipo: 'document' },
]

function esUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim())
}

/** El tipo, mirando la columna semántica → el mime → la extensión. */
function tipoDesdeColumnas(m: MensajeConMedia): MediaKind | null {
  const t = (m.media_type ?? '').trim().toLowerCase()
  if (t === 'image' || t === 'video' || t === 'audio' || t === 'document') return t
  // Meta también manda 'sticker' y 'voice'; se tratan como lo que son de mostrar.
  if (t === 'sticker') return 'image'
  if (t === 'voice' || t === 'ptt') return 'audio'

  const mime = (m.media_mime_type ?? '').trim().toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime) return 'document'

  const url = m.media_url ?? ''
  for (const { re, tipo } of POR_EXTENSION) if (re.test(url)) return tipo
  return null
}

/**
 * Lo que dice el texto: `"[Foto] https://…"`, `"[Documento] plano-1.pdf"`,
 * `"[Foto] Frente de la casa"`. Devuelve la etiqueta y TODO lo que sigue, sin
 * partirlo.
 *
 * No se parte acá a propósito: la primera versión tomaba la primera palabra
 * como si fuera la URL, y con un epígrafe de verdad ("Frente de la casa") se
 * comía "Frente" y mostraba "de la casa". Quién es la URL y quién el epígrafe
 * lo decide `resolverMedia`, que es el que sabe mirar si algo ES una URL.
 */
function leerPrefijo(bodyPreview: string | null): { tipo: MediaKind; resto: string } | null {
  const texto = (bodyPreview ?? '').trim()
  const m = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(texto)
  if (!m) return null
  const etiqueta = m[1].trim().toLowerCase()
  const tipo = ETIQUETAS[etiqueta]
  if (!tipo) return null
  return { tipo, resto: m[2].trim() }
}

/**
 * Separa un resto de texto en "la URL, si arranca con una" y "el epígrafe".
 * `"https://x/a.jpg Frente"` → url + "Frente". `"Frente de la casa"` → sin url.
 */
function partirResto(resto: string): { url: string | null; texto: string } {
  const [primero, ...cola] = resto.split(/\s+/)
  if (primero && esUrl(primero)) return { url: primero, texto: cola.join(' ').trim() }
  return { url: null, texto: resto }
}

/** Un solo token con punto y sin espacios se lee como nombre de archivo. */
function pareceNombreDeArchivo(v: string): boolean {
  return /^[^\s]+\.[a-z0-9]{2,5}$/i.test(v.trim())
}

/**
 * El archivo de un mensaje, o `null` si no lleva ninguno (ahí el caller muestra
 * el texto de siempre).
 */
export function resolverMedia(m: MensajeConMedia): MediaResuelto | null {
  const prefijo = leerPrefijo(m.body_preview)

  // El epígrafe nunca puede ser una URL: mostrarla sería volver al problema
  // original, un link crudo en pantalla.
  const limpiarCaption = (v: string | null): string | null => {
    const t = (v ?? '').trim()
    if (!t || esUrl(t)) return null
    return t
  }

  const nombreDesdeUrl = (u: string): string | null =>
    decodeURIComponent((u.split('?')[0].split('/').pop() ?? '').trim()) || null

  if (m.media_url) {
    const tipo = tipoDesdeColumnas(m) ?? prefijo?.tipo ?? 'document'
    // El epígrafe sale del texto SIN la URL que suele venir pegada adelante.
    const resto = prefijo ? partirResto(prefijo.resto).texto : (m.body_preview ?? '')
    return {
      tipo,
      url: m.media_url,
      // Sin `media_filename`, el nombre sale de la URL — mejor "plano.pdf" que
      // "Descargar archivo".
      filename: m.media_filename ?? nombreDesdeUrl(m.media_url),
      caption: limpiarCaption(resto || null),
    }
  }

  if (!prefijo) return null

  // Sin columnas: el mensaje viejo. Con URL se muestra igual que uno nuevo; con
  // un nombre de archivo queda la ficha sin link.
  const { url, texto } = partirResto(prefijo.resto)
  if (url) {
    // La extensión manda sobre la etiqueta: un "[Documento] …/foto.jpg" es una foto.
    const tipoUrl = POR_EXTENSION.find(x => x.re.test(url))?.tipo
    return {
      tipo: tipoUrl ?? prefijo.tipo,
      url,
      filename: m.media_filename ?? nombreDesdeUrl(url),
      caption: limpiarCaption(texto || null),
    }
  }
  const esNombre = pareceNombreDeArchivo(prefijo.resto)
  return {
    tipo: prefijo.tipo,
    url: null,
    filename: m.media_filename ?? (esNombre ? prefijo.resto : null),
    caption: limpiarCaption(esNombre ? null : prefijo.resto || null),
  }
}

/** Cómo se nombra el tipo en pantalla, para el equipo. */
export function etiquetaDeTipo(tipo: MediaKind): string {
  switch (tipo) {
    case 'image': return 'Foto'
    case 'video': return 'Video'
    case 'audio': return 'Audio'
    default: return 'Documento'
  }
}

/**
 * El último mensaje, como se lee en la LISTA de conversaciones.
 *
 * Ahí también se mostraba el texto crudo: una conversación que terminaba con
 * una foto se leía `[Foto] https://imgar.zonapropcdn.com/avisos/1/00/59/…`,
 * cortado a la mitad por el ancho de la columna. WhatsApp muestra "Foto" y
 * listo; acá lo mismo, con el nombre del archivo cuando aporta algo (un plano
 * se reconoce por su nombre, una foto no).
 */
export function resumenDeUltimoMensaje(texto: string | null): string | null {
  if (!texto) return null
  const media = resolverMedia({
    body_preview: texto,
    media_url: null,
    media_mime_type: null,
    media_filename: null,
    media_type: null,
  })
  if (!media) return texto
  const etiqueta = etiquetaDeTipo(media.tipo)
  // El epígrafe es lo que la persona lee primero; si no hay, el nombre del
  // archivo; si tampoco, alcanza con el tipo.
  if (media.caption) return `${etiqueta}: ${media.caption}`
  if (media.tipo === 'document' && media.filename) return `${etiqueta}: ${media.filename}`
  return etiqueta
}
