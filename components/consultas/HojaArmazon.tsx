'use client'

/**
 * Armazón común de las hojas de "Agendar desde una consulta" (elegir propiedad,
 * revisar teléfono): título arriba, cuerpo que scrollea y pie fijo con el botón.
 * En el celular ocupa casi toda la pantalla como en el lienzo: el diálogo base
 * ya se ancla abajo por debajo de 640 px (components/ui/dialog.tsx); acá se le da
 * alto y se hace que SOLO el cuerpo scrollee (mismo arreglo que
 * AgendarVisitaDialog: sin `flex-col overflow-hidden` + `min-h-0`, el pie quedaba
 * flotando y la lista asomando debajo).
 */
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LUGAR_PARA_LA_X } from '@/components/visitas/agendar/titulo-paso'
import { cn } from '@/lib/utils'

interface Props {
  titulo: string
  /** Si no hay subtítulo visible, igual va uno para lectores de pantalla (Radix lo pide). */
  descripcion: string
  descripcionVisible?: boolean
  pie: ReactNode
  children: ReactNode
  onCerrar: () => void
}

export function HojaArmazon({ titulo, descripcion, descripcionVisible = true, pie, children, onCerrar }: Props) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar() }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh] sm:max-w-lg max-sm:h-[94dvh]">
        <div className="shrink-0 space-y-2 px-4 pt-5 pb-2 sm:px-6">
          <DialogTitle className={cn('text-xl font-semibold', LUGAR_PARA_LA_X)}>{titulo}</DialogTitle>
          <DialogDescription className={descripcionVisible ? 'text-sm text-muted-foreground' : 'sr-only'}>
            {descripcion}
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-6">{children}</div>
        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {pie}
        </div>
      </DialogContent>
    </Dialog>
  )
}
