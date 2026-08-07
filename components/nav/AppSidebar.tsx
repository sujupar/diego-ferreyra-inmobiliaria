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
import {
  activeHrefAmong, isCollapsible, navHrefs,
  type NavCollapsible, type NavGroup, type NavItem,
} from '@/lib/nav/sections'

function ItemLink({ item, activo, badge }: { item: NavItem; activo: boolean; badge: number }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={activo} tooltip={item.label}>
        <Link href={item.href} aria-current={activo ? 'page' : undefined}>
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

/**
 * Un desplegable necesita estado propio (para forzarse a abierto cuando la
 * navegación entra en él) — por eso vive en su propio componente: un Hook no
 * se puede llamar dentro del `.map` del padre.
 */
function CollapsibleNavEntry({ entry, pathname }: { entry: NavCollapsible; pathname: string }) {
  const hrefActivo = activeHrefAmong(entry.items.map(i => i.href), pathname)
  const contieneActual = hrefActivo !== null
  const [abierto, setAbierto] = useState(contieneActual)

  // Arranca según la ruta con la que se monta. Si DESPUÉS una navegación
  // client-side entra en este submenú, se fuerza a abierto — pero nunca se
  // fuerza a cerrado, así el usuario lo sigue pudiendo plegar/desplegar a
  // mano sin que la ruta se lo pise en la siguiente navegación.
  useEffect(() => {
    if (contieneActual) setAbierto(true)
  }, [contieneActual])

  return (
    <Collapsible asChild open={abierto} onOpenChange={setAbierto} className="group/collapsible">
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
              const activa = sub.href === hrefActivo
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
        {groups.map((g, i) => {
          // Los ítems sueltos de ESTE grupo compiten entre sí por "quién es
          // el activo" — nunca se evalúan de forma independiente (ese era el
          // bug: /properties y /properties/new "matcheaban" los dos a la vez).
          const itemsSueltos = g.entries.filter((e): e is NavItem => !isCollapsible(e))
          const hrefActivo = activeHrefAmong(itemsSueltos.map(e => e.href), pathname)

          return (
            <SidebarGroup key={g.label ?? `sin-titulo-${i}`}>
              {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.entries.map(entry => {
                    if (!isCollapsible(entry)) {
                      return (
                        <ItemLink
                          key={entry.href}
                          item={entry}
                          activo={entry.href === hrefActivo}
                          badge={inboxCount}
                        />
                      )
                    }
                    return (
                      <CollapsibleNavEntry key={entry.label} entry={entry} pathname={pathname} />
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
