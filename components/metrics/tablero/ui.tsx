'use client'

/**
 * Piezas compartidas del Tablero: secciones numeradas, números de arriba, tablas
 * "período contra comparado" y formatos de plata (USD con pesos debajo).
 */

import type { ReactNode } from 'react'
import { DeDondeSale, Variacion } from '@/components/metrics/panel/DeDondeSale'
import { SIN_DATO, num, usd, variacion } from '@/components/metrics/panel/formato'

/** Pesos argentinos sin decimales. null = "sin dato", nunca $ 0. */
export function ars(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return SIN_DATO
  return '$ ' + num(n)
}

/** Monto en USD (con decimales si es chico) y, debajo, en pesos. */
export function Plata({ u, a, decimales }: { u: number | null | undefined; a?: number | null; decimales?: number }) {
  const d = decimales ?? (u != null && Math.abs(u) < 100 ? 1 : 0)
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{usd(u, d)}</span>
      {a !== undefined && <span className="text-xs text-muted-foreground">{ars(a)}</span>}
    </span>
  )
}

export const tabla = 'w-full text-sm tabular-n'
export const th = 'font-medium text-xs text-muted-foreground py-1.5 px-2 whitespace-nowrap'
export const td = 'py-1.5 px-2'
export const tdR = 'py-1.5 px-2 text-right whitespace-nowrap'

/** Una sección numerada, como en el documento de la reunión. */
export function Seccion({ n, titulo, fuente, children }: { n: number; titulo: string; fuente?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-baseline gap-2">
        <span className="text-sm font-bold text-primary">{n}</span>{titulo}{fuente && <DeDondeSale texto={fuente} />}
      </h2>
      {children}
    </section>
  )
}

export function Subtitulo({ children, fuente }: { children: ReactNode; fuente?: string }) {
  return <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 pt-1">{children}{fuente && <DeDondeSale texto={fuente} />}</h3>
}

export function Caja({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-card overflow-x-auto ${className}`}>{children}</div>
}

/** Uno de los números de arriba. */
export function Cuadro({ titulo, valor, sub, antes, destacado, alerta, fuente }: {
  titulo: string; valor: ReactNode; sub?: ReactNode; antes?: ReactNode; destacado?: boolean; alerta?: boolean; fuente?: string
}) {
  const borde = alerta ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900' : destacado ? 'border-primary/40 bg-primary/5' : 'bg-card'
  return (
    <div className={`rounded-xl border p-3 min-w-0 space-y-0.5 ${borde}`}>
      <p className="text-xs text-muted-foreground flex items-center gap-1">{titulo}{fuente && <DeDondeSale texto={fuente} />}</p>
      <p className="text-xl font-semibold tabular-n break-words">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground tabular-n">{sub}</p>}
      {antes && <p className="text-xs text-muted-foreground tabular-n">{antes}</p>}
    </div>
  )
}

/** Celda de variación contra el comparado. */
export function CeldaVar({ actual, antes, bueno = 'sube' }: { actual: number | null | undefined; antes: number | null | undefined; bueno?: 'sube' | 'baja' }) {
  const v = variacion(actual, antes)
  return <td className={tdR}>{v == null ? <span className="text-xs text-muted-foreground">—</span> : <Variacion v={v} bueno={bueno} />}</td>
}

/** Diferencia en puntos entre dos porcentajes: "+0,7 pts". */
export function CeldaPuntos({ actual, antes }: { actual: number | null | undefined; antes: number | null | undefined }) {
  if (actual == null || antes == null) return <td className={tdR}><span className="text-xs text-muted-foreground">—</span></td>
  const d = (actual - antes) * 100
  const color = Math.abs(d) < 0.05 ? 'text-muted-foreground' : d > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
  return <td className={tdR}><span className={`text-xs ${color}`}>{d > 0 ? '+' : d < 0 ? '−' : ''}{num(Math.abs(d), 1)} pts</span></td>
}
