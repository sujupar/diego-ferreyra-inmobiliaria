import { CheckCircle2 } from 'lucide-react'

/** Se llena en la fase 2, cuando empiece a publicarse de verdad. */
export function PestanaPublicado() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
      <CheckCircle2 className="h-8 w-8" aria-hidden />
      <p>Todavía no se publicó nada.</p>
      <p className="text-sm">Cuando un video salga, acá vas a ver en qué redes y el enlace a cada una.</p>
    </div>
  )
}
