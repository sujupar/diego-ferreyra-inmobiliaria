/** Formato de números del panel (es-AR). Un null se muestra "sin dato", nunca 0. */
const nf = (d: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: 0 })

export const SIN_DATO = 'sin dato'

export function usd(n: number | null | undefined, decimales = 0): string {
  if (n == null || !Number.isFinite(n)) return SIN_DATO
  return 'USD ' + nf(decimales).format(n)
}

export function num(n: number | null | undefined, decimales = 0): string {
  if (n == null || !Number.isFinite(n)) return SIN_DATO
  return nf(decimales).format(n)
}

export function pct(n: number | null | undefined, decimales = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return nf(decimales).format(n * 100) + '%'
}

/** Variación contra el período comparado: +12% / −5% (null si no hay base). */
export function variacion(actual: number | null | undefined, antes: number | null | undefined): number | null {
  if (actual == null || antes == null || !Number.isFinite(actual) || !Number.isFinite(antes) || antes === 0) return null
  return (actual - antes) / Math.abs(antes)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function fechaCorta(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!d) return `${MESES[Number(m) - 1]}-${y.slice(2)}`
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y.slice(2)}`
}

/** Etiqueta de un grupo de la serie (día, lunes de la semana o mes). */
export function etiquetaGrupo(k: string, agrupar: 'dia' | 'semana' | 'mes'): string {
  if (agrupar === 'mes') return fechaCorta(k)
  const [, m, d] = k.split('-')
  return `${agrupar === 'semana' ? 'sem ' : ''}${Number(d)}/${Number(m)}`
}
