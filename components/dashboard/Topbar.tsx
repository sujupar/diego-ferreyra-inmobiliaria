'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { seccionDeOrigen } from '@/lib/nav/seccion-de-origen'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { titleForPath, type NavGroup } from '@/lib/nav/sections'

export function Topbar({ groups, children }: { groups: NavGroup[]; children?: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Una ficha abierta desde el CRM dice "CRM" arriba, no "Contactos" (D11).
  const { section, title } = titleForPath(groups, seccionDeOrigen(pathname, searchParams.get('volver')))

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0">
        {section && <div className="eyebrow truncate" title={section}>{section}</div>}
        <div className="truncate text-sm font-semibold leading-tight" title={title}>{title}</div>
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
