'use client'

import { useMemo } from 'react'
import { getNavSections } from '@/lib/nav/sections'
import { AppSidebar } from '@/components/nav/AppSidebar'
import { BottomNav } from '@/components/nav/BottomNav'
import { Topbar } from '@/components/dashboard/Topbar'
import type { Role } from '@/types/auth.types'

/**
 * El menú se ARMA acá, del lado del cliente, a partir del rol.
 *
 * POR QUÉ, si el layout es un componente de servidor y podría armarlo él:
 * cada `NavItem` lleva su `icon`, que es un COMPONENTE de lucide-react. React no
 * sabe mandar un componente como prop de servidor a cliente — lo intenta
 * serializar y falla con "Only plain objects can be passed to Client Components
 * from Server Components", y con eso se cae la pantalla ENTERA. Los tests de
 * `lib/nav/sections` no lo pueden ver porque nunca cruzan esa frontera; se ve
 * abriendo la app.
 *
 * Así que el servidor manda el ROL (un string) y el menú se calcula de este
 * lado. `getNavSections` es una función pura, y `lib/auth/roles` ya viaja al
 * navegador (lo usa `UserMenu`), así que esto no expone nada nuevo: quién puede
 * ENTRAR a cada ruta lo sigue decidiendo el servidor, no el menú.
 *
 * Son TRES envoltorios y no uno solo porque el menú lateral, la barra superior y
 * la barra inferior del celular viven en ramas distintas del marco (`AppSidebar`
 * afuera, las otras dos adentro del `SidebarInset`, una arriba y otra abajo del
 * área de contenido). Armar la lista tres veces es construir un array; el costo
 * es ninguno, y el motivo de la frontera es el mismo para las tres.
 */
export function SidebarForRole({ role, logoUrl }: { role: Role; logoUrl: string }) {
  const groups = useMemo(() => getNavSections(role), [role])
  return <AppSidebar groups={groups} logoUrl={logoUrl} />
}

export function TopbarForRole({ role, children }: { role: Role; children?: React.ReactNode }) {
  const groups = useMemo(() => getNavSections(role), [role])
  return <Topbar groups={groups}>{children}</Topbar>
}

export function BottomNavForRole({ role }: { role: Role }) {
  const groups = useMemo(() => getNavSections(role), [role])
  return <BottomNav groups={groups} />
}
