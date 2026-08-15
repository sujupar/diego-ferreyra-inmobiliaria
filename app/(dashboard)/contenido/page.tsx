import type { Metadata } from 'next'
import { ContenidoClient } from '@/components/contenido/ContenidoClient'

export const metadata: Metadata = { title: 'Central de Contenido' }

// Enlace directo (/contenido) — a propósito NO está en el menú lateral.
// El gate de rol vive en /api/contenido (solo admin/dueno/coordinador).
export default function ContenidoPage() {
  return <ContenidoClient />
}
