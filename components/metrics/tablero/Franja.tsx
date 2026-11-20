'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ETIQUETA_ESTADO, type Estado } from '@/lib/metrics/tablero/estado'
import { DeDondeSale, Variacion } from '@/components/metrics/panel/DeDondeSale'
import { SIN_DATO, num, variacion } from '@/components/metrics/panel/formato'

const COLOR_ESTADO: Record<Estado, string> = {
  mejoro: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  empeoro: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  igual: 'bg-muted text-muted-foreground border-border',
  sin_datos: 'bg-background text-muted-foreground border-dashed border-border',
}

export function EtiquetaEstado({ estado }: { estado: Estado }) {
  return <span className={`text-xs font-medium rounded-full border px-2 py-0.5 whitespace-nowrap ${COLOR_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>
}

/** Pesos argentinos sin decimales. null = "sin dato", nunca $ 0. */
export function ars(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return SIN_DATO
  return '$ ' + num(n)
}

export interface NumeroProps {
  titulo: string
  valor: string
  /** Valor crudo de ahora y del período comparado (para el % de cambio). */
  actual?: number | null
  antes?: number | null
  /** Cómo se muestra el valor comparado. */
  antesTexto?: string
  bueno?: 'sube' | 'baja'
  fuente?: string
  sub?: string
}

export function Numero({ titulo, valor, actual, antes, antesTexto, bueno = 'sube', fuente, sub }: NumeroProps) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs text-muted-foreground flex items-center gap-1">{titulo}{fuente && <DeDondeSale texto={fuente} />}</p>
      <p className="text-xl font-semibold tabular-n break-words">{valor}</p>
      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 tabular-n">
        {antesTexto !== undefined && <span>antes {antesTexto}</span>}
        <Variacion v={variacion(actual, antes)} bueno={bueno} />
        {sub && <span>{sub}</span>}
      </p>
    </div>
  )
}

/** Una franja del Tablero: título, estado, 3–4 números y el detalle desplegable debajo. */
export function Franja({ titulo, estado, regla, numeros, children }: { titulo: string; estado: Estado; regla: string; numeros: ReactNode; children: ReactNode }) {
  return (
    <Collapsible className="rounded-xl border bg-card">
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2">{titulo} <EtiquetaEstado estado={estado} /><DeDondeSale texto={regla} /></h2>
          <CollapsibleTrigger asChild>
            <button type="button" className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Ver detalle <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">{numeros}</div>
      </div>
      <CollapsibleContent className="border-t px-4 py-4 space-y-5">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** Subtítulo de una sección del detalle. */
export function Seccion({ titulo, fuente, children }: { titulo: string; fuente?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1">{titulo}{fuente && <DeDondeSale texto={fuente} />}</h3>
      {children}
    </section>
  )
}

export const tabla = 'w-full text-sm tabular-n'
export const th = 'font-normal text-xs text-muted-foreground py-1'
