'use client'

import { CircleCheck, Info, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EstadoError, EstadoVacio } from '../ui/EstadoBloque'
import { ALTO_CONTROL_LISTA } from '../ui/medidas'

// Estados de la cartera (maqueta `estados-lista.js`; spec "Estados de carga, vacío y error
// de la cartera"). Regla de todos: lo que no se pudo leer se DICE; nunca un cero ni un
// "no hay procesos" en su lugar.

const TARJETA = 'rounded-xl border border-border bg-card'

/** Esqueleto de la barra y de la lista, sin ningún número. */
export function CargandoCartera() {
  return (
    <div aria-busy="true" data-estado="cargando" className="flex flex-col gap-4">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden className="flex flex-wrap gap-2">
        {[7, 6, 9, 7].map((w, i) => (
          <span key={i} className="h-8 animate-pulse rounded-md bg-muted" style={{ width: `${w}rem` }} />
        ))}
      </div>
      <div aria-hidden className={cn(TARJETA, 'flex flex-col gap-4 p-4')}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="h-3.5 w-1/2 animate-pulse rounded-sm bg-muted" />
              <span className="h-3 w-1/3 animate-pulse rounded-sm bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ErrorCartera({ titulo, alReintentar }: { titulo: string; alReintentar: () => void }) {
  return (
    <section className={TARJETA}>
      <EstadoError titulo={titulo} texto="Los filtros siguen ahí. El resto de la plataforma funciona." onReintentar={alReintentar} />
    </section>
  )
}

export function BotonLimpiar({ alLimpiar }: { alLimpiar: () => void }) {
  return (
    <button
      type="button"
      onClick={alLimpiar}
      className={cn('inline-flex items-center rounded-md border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent', ALTO_CONTROL_LISTA)}
    >
      Limpiar filtros
    </button>
  )
}

export function VacioConFiltros({ titulo, alLimpiar }: { titulo: string; alLimpiar: () => void }) {
  return (
    <section className={TARJETA}>
      <EstadoVacio Icono={Search} titulo={titulo} texto="Probá sacar algún filtro o buscar de otra forma." accion={<BotonLimpiar alLimpiar={alLimpiar} />} />
    </section>
  )
}

export function VacioSinNada({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className={TARJETA}>
      <EstadoVacio Icono={CircleCheck} titulo={titulo} texto={texto} />
    </section>
  )
}

/** Coordinación sin solicitudes sin primer contacto ni vencidas (spec "Nada urgente"). */
export function NadaUrgente() {
  return (
    <section className={cn(TARJETA, 'flex items-start gap-3 p-4')} data-estado="nada-urgente">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <CircleCheck aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Nada urgente</h2>
        <p className="text-[13px] text-texto-suave">
          No hay solicitudes sin primer contacto ni llamadas vencidas. Abajo sigue el resto de la cartera.
        </p>
      </div>
    </section>
  )
}

/** Se pudo leer la lista pero no una de sus fuentes (spec "Falla solo el último contacto/las tareas"). */
export function AvisoFuente({ texto, alReintentar }: { texto: string; alReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-card px-3.5 py-2.5 text-[13px]">
      <TriangleAlert aria-hidden className="size-4 shrink-0 text-destructive-texto" />
      <p className="min-w-[12rem] flex-1">{texto}</p>
      <button
        type="button"
        onClick={alReintentar}
        className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent', ALTO_CONTROL_LISTA)}
      >
        <RefreshCw aria-hidden className="size-4" />
        Reintentar
      </button>
    </div>
  )
}

/** Un aviso que no es un error (tope de lectura, filtro de la dirección que no se aplicó). */
export function AvisoSuave({ texto }: { texto: string }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px]">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-suave" />
      {texto}
    </p>
  )
}
