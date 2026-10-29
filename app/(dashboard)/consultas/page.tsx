import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { requireAuth } from '@/lib/auth/require-role'
import { ConsultasClient } from './ConsultasClient'

export const metadata = { title: 'Consultas' }

// Los mismos cuatro roles que ven las consultas en la API (puedeGestionarVisitas):
// el abogado no. El menú no es la barrera; esto y la ruta lo son.
const ROLES_CONSULTAS = ['admin', 'dueno', 'coordinador', 'asesor']

export default async function ConsultasPage() {
  const user = await requireAuth()
  if (!ROLES_CONSULTAS.includes(user.profile.role)) redirect('/')
  // `<Suspense>` obligatorio: los filtros leen `useSearchParams()` y sin este
  // límite Next falla el prerender de la página.
  return (
    <Suspense fallback={<Esqueleto />}>
      <ConsultasClient />
    </Suspense>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Consultas</h1>
      <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </div>
  )
}
