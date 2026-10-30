import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { requireAuth } from '@/lib/auth/require-role'
import { cargarPeriodo, asesoresActivos } from '@/lib/consultas/servicio'
import { leerFiltrosConsultas } from '@/lib/consultas/filtros'
import { puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import type { PeriodoConsultas } from '@/lib/consultas/tipos'
import type { Role, UserWithProfile } from '@/types/auth.types'
import { ConsultasClient } from './ConsultasClient'

export const metadata = { title: 'Consultas' }

// Los mismos cuatro roles que ven las consultas en la API (puedeGestionarVisitas):
// el abogado no. El menú no es la barrera; esto y la ruta lo son.
const ROLES_CONSULTAS = ['admin', 'dueno', 'coordinador', 'asesor']

type Busqueda = Record<string, string | string[] | undefined>

/**
 * La página trae el período de la dirección YA ARMADO (spec Entrega 2 §3.1):
 * quién soy, los asesores y las consultas llegan con el HTML, sin los tres
 * pedidos que antes hacía el navegador después de cargar (cada uno ~1 s).
 * Después, la pantalla filtra en memoria y solo vuelve a pedir si cambia el período.
 */
export default async function ConsultasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const user = await requireAuth()
  if (!ROLES_CONSULTAS.includes(user.profile.role)) redirect('/')
  // `<Suspense>`: el esqueleto sale enseguida mientras se leen las consultas, y
  // los filtros leen `useSearchParams()` (sin este límite Next falla el prerender).
  return (
    <Suspense fallback={<Esqueleto />}>
      <ConsultasConDatos user={user} searchParams={searchParams} />
    </Suspense>
  )
}

async function ConsultasConDatos({ user, searchParams }: { user: UserWithProfile; searchParams: Promise<Busqueda> }) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === 'string') sp.set(k, v)
    else if (Array.isArray(v) && v[0] !== undefined) sp.set(k, v[0])
  }
  const rol = user.profile.role as Role
  const filtros = leerFiltrosConsultas(sp, fechaEnArgentina(new Date()))
  const verTodo = puedeVerTodasLasVisitas(rol)

  const [periodo, asesores] = await Promise.allSettled([
    filtros.ok
      ? cargarPeriodo({ rol, usuarioId: user.id, desde: filtros.valor.desde, hasta: filtros.valor.hasta, etiqueta: filtros.valor.etiqueta })
      : Promise.resolve(null),
    verTodo ? asesoresActivos() : Promise.resolve([]),
  ])

  let inicial: PeriodoConsultas | null = null
  let errorInicial: string | null = null
  if (periodo.status === 'fulfilled') inicial = periodo.value
  else {
    console.error('[/consultas] no se pudo leer el período', periodo.reason)
    errorInicial = 'No pudimos cargar las consultas'
  }
  // Sin la lista de asesores la pantalla anda igual (el filtro de asesor queda vacío).
  if (asesores.status === 'rejected') console.error('[/consultas] no se pudieron leer los asesores', asesores.reason)

  return (
    <ConsultasClient
      yo={{ id: user.id, rol }}
      asesores={asesores.status === 'fulfilled' ? asesores.value : []}
      inicial={inicial}
      errorInicial={errorInicial}
    />
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
