'use client'

import type { LucideIcon } from 'lucide-react'
import { Clock, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL } from './medidas'

// Estados de un bloque (maqueta `.estado`, `estadoCarga`, `estadoError`): carga, vacío y
// error. Un bloque que no pudo cargar lo DICE: nunca muestra un vacío ni un cero en su
// lugar (spec crm-ficha-contacto, "Cada bloque carga y falla por separado").

export function EstadoCarga({ filas = 3 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" data-estado="cargando">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-2" aria-hidden>
          <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-3.5 w-3/5 animate-pulse rounded-sm bg-muted" />
            <span className="h-3.5 w-[30%] animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EstadoVacio({
  Icono = Clock,
  titulo,
  texto,
  accion,
}: {
  Icono?: LucideIcon
  titulo: string
  texto?: string
  accion?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center" data-estado="vacio">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-secondary text-texto-suave">
        <Icono aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-semibold">{titulo}</p>
      {texto && <p className="max-w-[22rem] text-[13px] text-texto-suave">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  )
}

export function EstadoError({
  titulo = 'No se pudo cargar',
  texto = 'El resto de la pantalla sigue funcionando.',
  onReintentar,
  className,
}: {
  titulo?: string
  texto?: string
  onReintentar: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-1.5 px-4 py-6 text-center', className)} data-estado="error">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive-suave text-destructive-texto">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="max-w-[22rem] text-[13px] text-texto-suave">{texto}</p>
      <button
        type="button"
        onClick={onReintentar}
        className={cn(
          'mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent',
          ALTO_CONTROL,
        )}
      >
        <RefreshCw aria-hidden className="size-4" />
        Reintentar
      </button>
    </div>
  )
}
