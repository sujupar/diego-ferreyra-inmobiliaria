/**
 * Minutos y porcentaje vistos del video de bienvenida, desde los TRAMOS (D4). Puro.
 *
 * `video_view_state.watched_buckets` es una cadena de 100 caracteres '0'/'1': cada uno es una
 * centésima del video, y se une con OR entre visitas y dispositivos. Es la única medida que no
 * se infla al adelantar: `max_percent` sube con un salto y `completed` se marca al llegar al
 * final aunque sea saltando. Por eso todo lo que se muestra del video de bienvenida sale de acá.
 */

export const TRAMOS = 100
/** "Lo terminó": 95 de 100 tramos (deja margen para los créditos y el redondeo del último). */
export const TRAMOS_PARA_TERMINAR = 95

export function contarTramos(buckets: string | null | undefined): number {
  if (!buckets) return 0
  let n = 0
  for (const c of buckets) if (c === '1') n++
  return n
}

export function porcentajeVisto(buckets: string | null | undefined): number {
  return Math.min(100, Math.round((contarTramos(buckets) / TRAMOS) * 100))
}

export function segundosVistos(buckets: string | null | undefined, duracionS: number | null | undefined): number {
  if (!duracionS || duracionS <= 0) return 0
  return (contarTramos(buckets) * duracionS) / TRAMOS
}

export function loTermino(buckets: string | null | undefined): boolean {
  return contarTramos(buckets) >= TRAMOS_PARA_TERMINAR
}

/** 510 → "8:30". */
export function formatoMinutos(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
