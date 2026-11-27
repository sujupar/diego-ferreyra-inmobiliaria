'use client'

import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ChevronLeft, ChevronRight, Phone, StickyNote, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { FormLlamada, type TipoGuardado } from './FormLlamada'
import { FormNota } from './FormNota'
import type { RespuestaGuardado } from './guardar-actividad'

// Hoja del "+" en la vista de una columna (maqueta `#ficha-hoja-mas`): menú "Agregar" →
// "Registrar llamada" o "Nota", con "Volver". Las dos vistas están SIEMPRE en el árbol
// (se muestran u ocultan) para poder darles foco DENTRO del mismo toque: en iPhone es lo
// único que abre el teclado al entrar a "Nota" (D6). Al cerrarla vuelve al menú.

export type Vista = 'menu' | 'llamada' | 'nota'
const TITULOS: Record<Vista, string> = { menu: 'Agregar', llamada: 'Registrar llamada', nota: 'Nota' }

export function HojaAgregar({
  abierta,
  vistaAlAbrir = 'menu',
  onAbierta,
  contactoId,
  onNotaGuardada,
  onLlamadaGuardada,
  reloj,
}: {
  abierta: boolean
  /** Desde un vacío de la actividad ("Registrar llamada") la hoja abre directo en esa vista. */
  vistaAlAbrir?: Vista
  onAbierta: (a: boolean) => void
  contactoId: string
  onNotaGuardada: (r: RespuestaGuardado) => void
  onLlamadaGuardada: (r: RespuestaGuardado, tipo: TipoGuardado) => void
  reloj?: () => Date
}) {
  const [vista, setVista] = useState<Vista>('menu')
  const refPrimera = useRef<HTMLButtonElement>(null)
  const refNoAtendio = useRef<HTMLButtonElement>(null)
  const refNota = useRef<HTMLTextAreaElement>(null)
  const refCuerpo = useRef<HTMLDivElement>(null)

  const ir = (v: Vista) => {
    // flushSync: la vista tiene que estar visible ANTES de darle foco, en este mismo toque.
    flushSync(() => setVista(v))
    if (refCuerpo.current) refCuerpo.current.scrollTop = 0
    const enfocar = () => {
      if (v === 'llamada') refNoAtendio.current?.focus({ preventScroll: true })
      else if (v === 'nota') refNota.current?.focus({ preventScroll: true })
      else refPrimera.current?.focus({ preventScroll: true })
    }
    enfocar()
    // Al ABRIR directo en una vista (desde onOpenAutoFocus), flushSync no llega a dibujarla:
    // el botón todavía no existe y el foco quedaba en la página (QA de crm-inicio, celular).
    // Se reintenta en el cuadro siguiente si el foco no quedó dentro de la hoja.
    requestAnimationFrame(() => {
      if (!refCuerpo.current?.closest('[role="dialog"]')?.contains(document.activeElement)) enfocar()
    })
  }

  return (
    <Sheet
      open={abierta}
      onOpenChange={(a) => {
        if (!a) setVista('menu')
        onAbierta(a)
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex max-h-[calc(var(--app-vh)-2rem)] flex-col gap-0 overflow-hidden rounded-t-[calc(var(--radius)+4px)] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ir(vistaAlAbrir)
        }}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
        <div className="flex min-h-12 shrink-0 items-center gap-2 py-1 pl-4 pr-2">
          {vista !== 'menu' && (
            <button
              type="button"
              aria-label="Volver"
              onClick={() => ir('menu')}
              className="-ml-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-accent"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
          )}
          <SheetTitle className="min-w-0 flex-1 text-base font-semibold">{TITULOS[vista]}</SheetTitle>
          <SheetDescription className="sr-only">Registrar una llamada o escribir una nota sobre esta persona.</SheetDescription>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => onAbierta(false)}
            className="inline-flex size-11 items-center justify-center rounded-md hover:bg-accent"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div ref={refCuerpo} data-hoja-cuerpo className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,var(--safe-b))] pt-2">
          <div hidden={vista !== 'menu'} className="flex flex-col gap-1.5" data-vista="menu">
            {(
              [
                { v: 'llamada', Icono: Phone, titulo: 'Registrar llamada', sub: 'Qué pasó cuando llamaste' },
                { v: 'nota', Icono: StickyNote, titulo: 'Nota', sub: 'Algo para acordarse de esta persona' },
              ] as const
            ).map((o, i) => (
              <button
                key={o.v}
                ref={i === 0 ? refPrimera : undefined}
                type="button"
                onClick={() => ir(o.v)}
                className="flex min-h-13 w-full items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2 text-left text-[15px] font-medium hover:bg-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <o.Icono aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  {o.titulo}
                  <small className="block text-xs font-normal text-texto-suave">{o.sub}</small>
                </span>
                <ChevronRight aria-hidden className="size-4 text-texto-suave" />
              </button>
            ))}
          </div>
          <div hidden={vista !== 'llamada'} data-vista="llamada">
            <FormLlamada contactoId={contactoId} onGuardado={onLlamadaGuardada} refNoAtendio={refNoAtendio} enHoja reloj={reloj} />
          </div>
          <div hidden={vista !== 'nota'} data-vista="nota">
            <FormNota contactoId={contactoId} onGuardada={onNotaGuardada} refCampo={refNota} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
