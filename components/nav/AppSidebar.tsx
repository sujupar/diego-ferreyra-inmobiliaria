'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { isCollapsible, navHrefs, type NavGroup, type NavItem } from '@/lib/nav/sections'

/** La ruta activa es la exacta o cualquier subruta suya (`/properties/abc-1`). */
function estaActiva(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function ItemLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge: number }) {
  const activa = estaActiva(item.href, pathname)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={activa} tooltip={item.label}>
        <Link href={item.href} aria-current={activa ? 'page' : undefined}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {item.badge === 'inbox' && badge > 0 && (
        <SidebarMenuBadge aria-label={`${badge} sin leer`}>{badge}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}

export function AppSidebar({ groups, logoUrl }: { groups: NavGroup[]; logoUrl: string }) {
  const pathname = usePathname()
  const tieneInbox = navHrefs(groups).includes('/inbox')
  const [inboxCount, setInboxCount] = useState(0)

  // Mismo comportamiento que el DashboardNav anterior: al montar y cada 60 s,
  // con try/catch silencioso. Si el contador falla, el menú tiene que funcionar igual.
  useEffect(() => {
    if (!tieneInbox) return
    let activo = true
    async function cargar() {
      try {
        const res = await fetch('/api/leads/count')
        if (!res.ok) return
        const { new: count } = await res.json()
        if (activo) setInboxCount(count ?? 0)
      } catch {
        // best-effort
      }
    }
    cargar()
    const handle = setInterval(cargar, 60_000)
    return () => {
      activo = false
      clearInterval(handle)
    }
  }, [tieneInbox])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5">
          <img src={logoUrl} alt="Diego Ferreyra Inmobiliaria" className="h-7 w-auto object-contain" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g, i) => (
          <SidebarGroup key={g.label ?? `sin-titulo-${i}`}>
            {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.entries.map(entry => {
                  if (!isCollapsible(entry)) {
                    return (
                      <ItemLink key={entry.href} item={entry} pathname={pathname} badge={inboxCount} />
                    )
                  }
                  const abierto = entry.items.some(i => estaActiva(i.href, pathname))
                  return (
                    <Collapsible key={entry.label} asChild defaultOpen={abierto} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={entry.label}>
                            <entry.icon />
                            <span>{entry.label}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {entry.items.map(sub => {
                              const activa = estaActiva(sub.href, pathname)
                              return (
                                <SidebarMenuSubItem key={sub.href}>
                                  <SidebarMenuSubButton asChild isActive={activa}>
                                    <Link href={sub.href} aria-current={activa ? 'page' : undefined}>
                                      <span>{sub.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
