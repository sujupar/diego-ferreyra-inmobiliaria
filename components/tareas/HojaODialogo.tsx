'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { HojaCelular } from '@/components/crm/ui/HojaCelular'

// En el celular, hoja desde abajo (maqueta `.hoja`); desde 768 px, diálogo centrado. El
// mismo contenido y el mismo pie en los dos (GUIA.md, hojas).
export function HojaODialogo({
  abierta,
  onAbierta,
  titulo,
  descripcion,
  children,
  pie,
  alAbrir,
}: {
  abierta: boolean
  onAbierta: (a: boolean) => void
  titulo: string
  descripcion: string
  children: React.ReactNode
  pie?: React.ReactNode
  alAbrir?: () => void
}) {
  const celular = useIsMobile()
  if (celular) {
    return (
      <HojaCelular abierta={abierta} onAbierta={onAbierta} titulo={titulo} descripcion={descripcion} pie={pie} alAbrir={alAbrir}>
        {children}
      </HojaCelular>
    )
  }
  return (
    <Dialog open={abierta} onOpenChange={onAbierta}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          if (!alAbrir) return
          e.preventDefault()
          alAbrir()
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">{children}</div>
        {pie && <DialogFooter>{pie}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
