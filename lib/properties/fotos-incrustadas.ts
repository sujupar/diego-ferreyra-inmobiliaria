/**
 * Fotos "incrustadas": un `data:image/...;base64,...` guardado como si fuera
 * una URL dentro de `properties.photos`.
 *
 * POR QUÉ EXISTE (2026-09-14, Av. Hipólito Yrigoyen 1550): el asistente de
 * tasación guarda las fotos así (`FileReader.readAsDataURL`) en
 * `appraisals.property_images`, y al captar desde la tasación se heredaban tal
 * cual. Una captura de Street View de 4,4 MB en base64 hizo que MercadoLibre
 * devolviera 413 (el body del aviso era la foto entera) y que Argenprop
 * rechazara "Multimedia.Url". Este módulo es puro: detecta, parsea y separa.
 * La subida a Storage vive en `materializar-fotos.ts`.
 */

const MIME_A_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export interface FotoIncrustada {
  mime: string
  extension: string
  bytes: Buffer
}

/** ¿Es un `data:` URL? (sin importar si es una imagen válida). */
export function esFotoIncrustada(valor: unknown): boolean {
  return typeof valor === 'string' && /^\s*data:/i.test(valor)
}

/**
 * Decodifica un data URL de imagen. Devuelve null si no es una imagen
 * soportada (jpeg/png/webp), si no viene en base64 o si el base64 está vacío.
 * SVG queda afuera a propósito: puede llevar scripts y ningún portal lo acepta.
 */
export function parsearDataUrl(valor: string): FotoIncrustada | null {
  if (!esFotoIncrustada(valor)) return null
  const m = /^\s*data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(valor)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const extension = MIME_A_EXTENSION[mime]
  if (!extension) return null
  const base64 = m[2].replace(/\s+/g, '')
  if (base64.length === 0) return null
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) return null
  return { mime, extension, bytes }
}

/** Índices de las fotos incrustadas y de los enlaces http(s), en orden. */
export function separarFotos(photos: readonly unknown[]): { incrustadas: number[]; enlaces: number[] } {
  const incrustadas: number[] = []
  const enlaces: number[] = []
  photos.forEach((p, i) => {
    if (esFotoIncrustada(p)) incrustadas.push(i)
    else if (typeof p === 'string' && /^https?:\/\//i.test(p)) enlaces.push(i)
  })
  return { incrustadas, enlaces }
}
