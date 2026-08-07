'use client'

import { usePathname } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { titleForPath, type NavGroup } from '@/lib/nav/sections'

export function Topbar({ groups, children }: { groups: NavGroup[]; children?: React.ReactNode }) {
  const pathname = usePathname()
  const { section, title } = titleForPath(groups, pathname)

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0">
        {section && <div className="eyebrow truncate">{section}</div>}
        <h1 className="truncate text-sm font-semibold leading-tight">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
