import type { Metadata } from 'next'
import { PublicacionesClient } from '@/components/publicaciones/PublicacionesClient'

export const metadata: Metadata = { title: 'Publicaciones' }

// El permiso lo decide /api/publicaciones (admin/dueño/coordinador), igual que
// en /contenido: el menú no es la barrera.
export default function PublicacionesPage() {
  return <PublicacionesClient />
}
