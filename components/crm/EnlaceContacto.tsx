'use client'

import Link from 'next/link'
import { alcanceContactos } from '@/lib/auth/contact-access'

// El nombre de una persona como enlace a su ficha (crm-ficha-y-llamadas, 11.1). Sin
// contacto, sin rol conocido todavía, o para un rol que no puede abrir fichas
// (`alcanceContactos` = 'ninguno': el abogado, los viejos `agent`/`viewer` y cualquier rol
// desconocido; revisión 12.1), queda como texto. La ficha vuelve a mirar el permiso en el servidor: esto solo evita
// dibujar un enlace que llevaría a "No tenés permiso".
export function EnlaceContacto({
  contactoId,
  rol,
  children,
  className,
  detenerClic = false,
}: {
  contactoId: string | null | undefined
  rol: string | null | undefined
  children: React.ReactNode
  className?: string
  /** Dentro de una fila que ya navega al hacer clic: el clic del nombre no sube. */
  detenerClic?: boolean
}) {
  if (!contactoId || !rol || alcanceContactos(rol) === 'ninguno') return <span className={className}>{children}</span>
  return (
    <Link
      href={`/contacts/${encodeURIComponent(contactoId)}`}
      onClick={detenerClic ? (e) => e.stopPropagation() : undefined}
      className={`${className ?? ''} hover:underline underline-offset-[3px]`}
    >
      {children}
    </Link>
  )
}
