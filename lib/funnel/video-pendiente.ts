/**
 * Copia de respaldo del último estado del video, guardada en el teléfono.
 *
 * POR QUÉ: el navegador de Instagram/Facebook cierra la página sin avisar, y el
 * último envío (el que dice cuánto se vio de verdad) se pierde. Cada envío deja
 * acá una copia; si la persona vuelve a la landing, se reenvía. El servidor se
 * queda con el MÁXIMO de cada dato, así que reenviar nunca duplica.
 *
 * Módulo puro: recibe el almacenamiento por parámetro (en el navegador es
 * `localStorage`; en las pruebas, un objeto en memoria). Todo es best-effort: un
 * almacenamiento lleno o bloqueado (modo privado de Safari) no rompe nada.
 */

export interface Almacen {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

const PREFIJO = 'df_video_pend:'
/** Un estado más viejo que esto ya no se reenvía: es de otra campaña y otro video. */
const VENCE_MS = 30 * 24 * 3600 * 1000

interface Guardado<T> {
  en: number
  datos: T
}

export function guardarPendiente<T>(almacen: Almacen | null, videoKey: string, datos: T, ahora: number): void {
  if (!almacen) return
  try {
    almacen.setItem(PREFIJO + videoKey, JSON.stringify({ en: ahora, datos } satisfies Guardado<T>))
  } catch {
    /* almacenamiento lleno o bloqueado: se sigue sin respaldo */
  }
}

/**
 * Devuelve lo que quedó guardado de una visita ANTERIOR y lo borra (se reenvía
 * una sola vez). Si está vencido o roto, lo borra y devuelve null.
 */
export function tomarPendiente<T>(almacen: Almacen | null, videoKey: string, ahora: number): T | null {
  if (!almacen) return null
  const k = PREFIJO + videoKey
  try {
    const crudo = almacen.getItem(k)
    if (!crudo) return null
    almacen.removeItem(k)
    const g = JSON.parse(crudo) as Partial<Guardado<T>>
    if (typeof g?.en !== 'number' || g.datos == null) return null
    if (ahora - g.en > VENCE_MS || g.en > ahora + 60_000) return null
    return g.datos as T
  } catch {
    return null
  }
}

/** `localStorage` si existe y se puede usar; null si no (SSR, modo privado, bloqueado). */
export function almacenDelNavegador(): Almacen | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}
