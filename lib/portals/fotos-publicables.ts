/**
 * Qué fotos de `properties.photos` pueden viajar a un portal.
 *
 * Los portales descargan cada foto desde su URL: solo sirve un enlace `https`
 * público. Todo lo demás —una imagen incrustada en base64 (el caso real del
 * 413 de MercadoLibre, 2026-09-14), un `http` sin s, un texto suelto— se
 * descarta ANTES de armar el aviso, y se devuelve con su posición y motivo
 * para que la validación se lo diga a la asistente en castellano.
 */

export const MOTIVO_INCRUSTADA = 'es una imagen incrustada (base64), no un archivo subido'
export const MOTIVO_NO_SEGURO = 'es un enlace http sin s; los portales exigen https'
export const MOTIVO_NO_ENLACE = 'no es un enlace'

/** Más largo que esto no es una URL de Storage: es un base64 disfrazado. */
const LARGO_MAXIMO_URL = 2000

export interface FotoDescartada {
  /** Posición en `properties.photos` (0 = portada). */
  indice: number
  motivo: string
}

export interface FotosPublicables {
  validas: string[]
  descartadas: FotoDescartada[]
}

export function fotosPublicables(photos: readonly unknown[] | null | undefined): FotosPublicables {
  const validas: string[] = []
  const descartadas: FotoDescartada[] = []
  ;(photos ?? []).forEach((p, indice) => {
    if (typeof p !== 'string' || p.trim() === '') {
      descartadas.push({ indice, motivo: MOTIVO_NO_ENLACE })
      return
    }
    const url = p.trim()
    if (/^data:/i.test(url)) {
      descartadas.push({ indice, motivo: MOTIVO_INCRUSTADA })
      return
    }
    if (/^http:\/\//i.test(url)) {
      descartadas.push({ indice, motivo: MOTIVO_NO_SEGURO })
      return
    }
    if (!/^https:\/\/[^/\s]+/i.test(url) || url.length > LARGO_MAXIMO_URL) {
      descartadas.push({ indice, motivo: MOTIVO_NO_ENLACE })
      return
    }
    validas.push(url)
  })
  return { validas, descartadas }
}

/** Frase para la asistente: "La foto 10 es una imagen incrustada…". */
export function describirDescartadas(descartadas: readonly FotoDescartada[]): string {
  return descartadas
    .map(d => `La foto ${d.indice + 1} ${d.motivo}`)
    .join('. ')
}
