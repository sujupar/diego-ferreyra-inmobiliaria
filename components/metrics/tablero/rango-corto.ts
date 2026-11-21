import type { Rango } from '@/lib/metrics/panel/rango'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "1–20 nov 26" si el rango cae en un mes; "25 oct – 5 nov 26" si cruza; "20 nov 26" si es un día. */
export function rangoCorto(r: Rango): string {
  const d = (s: string) => Number(s.slice(8))
  const m = (s: string) => MESES[Number(s.slice(5, 7)) - 1]
  const y = (s: string) => s.slice(2, 4)
  if (r.desde === r.hasta) return `${d(r.desde)} ${m(r.desde)} ${y(r.desde)}`
  if (r.desde.slice(0, 7) === r.hasta.slice(0, 7)) return `${d(r.desde)}–${d(r.hasta)} ${m(r.hasta)} ${y(r.hasta)}`
  return `${d(r.desde)} ${m(r.desde)}${y(r.desde) !== y(r.hasta) ? ' ' + y(r.desde) : ''} – ${d(r.hasta)} ${m(r.hasta)} ${y(r.hasta)}`
}
