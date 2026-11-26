import Link from 'next/link'
import { Lock, UserX } from 'lucide-react'

// Pantallas enteras de la ficha sin datos. Un contacto ajeno y uno inexistente ven LO
// MISMO: no se confirma que la persona exista (spec crm-ficha-contacto). Sin ningún dato.

function Pantalla({ Icono, titulo, texto }: { Icono: typeof Lock; titulo: string; texto: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-secondary text-texto-suave">
        <Icono aria-hidden className="size-6" />
      </span>
      <h1 className="text-base font-semibold">{titulo}</h1>
      <p className="max-w-sm text-sm text-texto-suave">{texto}</p>
      <Link
        href="/contacts"
        className="mt-2 inline-flex h-11 items-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-accent raton:h-9"
      >
        Ir a Contactos
      </Link>
    </div>
  )
}

export function ContactoNoEncontrado() {
  return <Pantalla Icono={UserX} titulo="No encontramos este contacto" texto="Puede que no exista o que no esté a tu nombre." />
}

export function SinAcceso() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-secondary text-texto-suave">
        <Lock aria-hidden className="size-6" />
      </span>
      <h1 className="text-base font-semibold">No tenés permiso para ver contactos</h1>
    </div>
  )
}
