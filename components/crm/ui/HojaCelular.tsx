'use client'

import { X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

// Hoja que sube desde abajo (maqueta `.hoja`), la misma forma que la del "+" de la ficha
// (`HojaAgregar`): manija, título, cerrar de 44 px, cuerpo que scrollea y pie fijo. El foco
// lo maneja quien la usa: `alAbrir` lo pone en el primer campo y `alCerrar` lo devuelve al
// botón que la abrió (Radix lo devolvería al disparador, pero acá no hay `SheetTrigger`).
export function HojaCelular({
  abierta,
  onAbierta,
  titulo,
  descripcion,
  children,
  pie,
  alAbrir,
  alCerrar,
}: {
  abierta: boolean
  onAbierta: (a: boolean) => void
  titulo: string
  descripcion: string
  children: React.ReactNode
  pie?: React.ReactNode
  alAbrir?: () => void
  alCerrar?: () => void
}) {
  return (
    <Sheet open={abierta} onOpenChange={onAbierta}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex max-h-[calc(var(--app-vh,100dvh)-2rem)] flex-col gap-0 overflow-hidden rounded-t-[calc(var(--radius)+4px)] p-0"
        onOpenAutoFocus={(e) => {
          if (!alAbrir) return
          e.preventDefault()
          alAbrir()
        }}
        onCloseAutoFocus={(e) => {
          if (!alCerrar) return
          e.preventDefault()
          alCerrar()
        }}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
        <div className="flex min-h-12 shrink-0 items-center gap-2 py-1 pl-4 pr-2">
          <SheetTitle className="min-w-0 flex-1 text-base font-semibold">{titulo}</SheetTitle>
          <SheetDescription className="sr-only">{descripcion}</SheetDescription>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => onAbierta(false)}
            className="inline-flex size-11 items-center justify-center rounded-md hover:bg-accent"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-3 pt-1">{children}</div>
        {pie && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 pb-[max(0.75rem,var(--safe-b,0px))] pt-3">{pie}</div>}
      </SheetContent>
    </Sheet>
  )
}
