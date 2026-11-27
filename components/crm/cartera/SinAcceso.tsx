import { Lock } from 'lucide-react'

// Pantalla entera para un rol sin vista del CRM o de Contactos (spec "Rol sin vista"): ni un
// número, ni un nombre. Componente de servidor sin props de función.
export function SinAccesoLista({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center" data-estado="sin-acceso">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-secondary text-texto-suave">
        <Lock aria-hidden className="size-6" />
      </span>
      <h1 className="text-base font-semibold">{titulo}</h1>
    </div>
  )
}
