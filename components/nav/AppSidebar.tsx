'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '@/components/ui/sidebar'
import {
  activeHrefAmong, isCollapsible, navHrefs,
  type NavCollapsible, type NavGroup, type NavItem,
} from '@/lib/nav/sections'

/**
 * En celular el menú es un Sheet (Dialog MODAL de Radix): mientras está abierto,
 * Radix le pone `pointer-events:none` al <body> y la X viene oculta
 * (`[&>button]:hidden` en la primitiva). Elegir una opción navegaba POR DETRÁS y
 * el panel seguía tapando la pantalla: el síntoma era "toqué CRM y no pasó
 * nada", en CADA navegación desde el menú. El menú anterior (`NavDropdown`,
 * borrado en el rediseño) cerraba en el `onClick` de cada link Y en un efecto
 * sobre `pathname`; acá se restituyen las dos mitades por el mismo motivo: el
 * efecto no alcanza cuando se toca la opción de la pantalla en la que ya estás
 * (la ruta no cambia, el efecto no corre) y el onClick no alcanza si alguna vez
 * se navega desde otro lado.
 */
function useCerrarPanelMovil() {
  const { isMobile, setOpenMobile } = useSidebar()
  return () => {
    if (isMobile) setOpenMobile(false)
  }
}

function ItemLink({ item, activo, badge }: { item: NavItem; activo: boolean; badge: number }) {
  const conAviso = item.badge === 'inbox' && badge > 0
  const cerrarPanel = useCerrarPanelMovil()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={activo} tooltip={item.label}>
        <Link href={item.href} aria-current={activo ? 'page' : undefined} onClick={cerrarPanel}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {conAviso && (
        <>
          <SidebarMenuBadge aria-label={`${badge} sin leer`}>{badge}</SidebarMenuBadge>
          {/*
            Colapsado, la primitiva esconde el número (no entra en 48px). Un punto
            sí entra, y la señal de "hay algo nuevo" es lo que no se puede perder:
            es la única urgencia que muestra la navegación. Va como HERMANO del
            botón, no adentro, porque `[&>span:last-child]:truncate` de la
            primitiva le pegaría al último <span> del botón — o sea al punto en vez
            de a la etiqueta. `aria-hidden` porque el conteo completo ya lo anuncia
            el badge de arriba.
          */}
          <span
            aria-hidden="true"
            data-testid="aviso-colapsado"
            className="pointer-events-none absolute top-1.5 right-1.5 hidden size-2 rounded-full bg-brand group-data-[collapsible=icon]:block"
          />
        </>
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
  const { state, isMobile } = useSidebar()
  const cerrarPanel = useCerrarPanelMovil()
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

  /*
    MENÚ COLAPSADO (solo escritorio): el submenú desplegable NO sirve. La
    primitiva le pone `display:none` a `SidebarMenuSub` y a sus links cuando el
    menú está en modo ícono (components/ui/sidebar.tsx), así que el disparador
    seguía visible pero clickearlo no mostraba nada: para un admin colapsado
    quedaban 13 rutas inalcanzables, y la cookie deja ese estado puesto 7 días.
    Colapsado, entonces, el desplegable se convierte en un menú FLOTANTE hacia la
    derecha. En celular no aplica: ahí el menú se abre como panel expandido.
  */
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Sin `tooltip`: ese prop envuelve al botón en un Tooltip y el
                disparador del flotante dejaría de recibir sus props. El nombre
                del grupo lo dice el encabezado del propio flotante. */}
            <SidebarMenuButton isActive={contieneActual}>
              <entry.icon />
              <span>{entry.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-44">
            <DropdownMenuLabel className="text-muted-foreground">{entry.label}</DropdownMenuLabel>
            {entry.items.map(sub => {
              const activa = sub.href === hrefActivo
              return (
                <DropdownMenuItem key={sub.href} asChild>
                  <Link
                    href={sub.href}
                    aria-current={activa ? 'page' : undefined}
                    onClick={cerrarPanel}
                    className={activa ? 'bg-brand-soft font-medium text-brand' : undefined}
                  >
                    {sub.label}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

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
                    <Link href={sub.href} aria-current={activa ? 'page' : undefined} onClick={cerrarPanel}>
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
  const { setOpenMobile } = useSidebar()
  const tieneInbox = navHrefs(groups).includes('/inbox')
  const [inboxCount, setInboxCount] = useState(0)
  const cerrarPanel = useCerrarPanelMovil()

  // Segunda mitad del cierre en celular (ver `useCerrarPanelMovil`): el panel
  // vive en `SidebarProvider`, que está en el layout y NO se remonta al navegar
  // dentro del mismo segmento — sin esto, `openMobile` se queda en `true`
  // aunque la pantalla de abajo ya haya cambiado.
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

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
        {/*
          El nombre accesible vive en el <a> (no en el `alt`) porque la imagen
          CAMBIA con el estado del menú: colapsado se esconde el logotipo y
          aparece el isotipo. Sin esto, el link se quedaría sin nombre en modo
          ícono, o lo tomaría del "DF".

          MODO ÍCONO: el riel mide 48px y, descontados los `p-2` del header y los
          `px-2` del link, la caja útil queda en ~16px. El logotipo es de 2500×547
          (4,57:1): con `object-contain` en una caja de 16×28 se dibujaba como una
          franja de ~16×3,5px, o sea el encabezado se veía VACÍO. Y como el estado
          colapsado vive en la cookie `sidebar_state` (7 días), quedaba así. Se
          cambia por un isotipo cuadrado, que es lo que entra en 48px.
        */}
        <Link
          href="/"
          aria-label="Diego Ferreyra Inmobiliaria — ir al inicio"
          onClick={cerrarPanel}
          className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <img src={logoUrl} alt="" className="h-7 w-auto object-contain group-data-[collapsible=icon]:hidden" />
          <span
            aria-hidden="true"
            data-testid="isotipo-colapsado"
            className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-semibold tracking-tight text-white group-data-[collapsible=icon]:flex"
          >
            DF
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* El landmark de navegación que tenía el menú viejo. `gap-2` porque el
            <nav> pasa a ser UN solo hijo del contenedor y se comía la separación
            que ese contenedor daba entre grupos. */}
        <nav aria-label="Navegación principal" className="flex flex-col gap-2">
          {groups.map((g, i) => {
            // Los ítems sueltos de ESTE grupo compiten entre sí por "quién es
            // el activo" — nunca se evalúan de forma independiente (ese era el
            // bug: /properties y /properties/new "matcheaban" los dos a la vez).
            const itemsSueltos = g.entries.filter((e): e is NavItem => !isCollapsible(e))
            const hrefActivo = activeHrefAmong(itemsSueltos.map(e => e.href), pathname)

            return (
              <SidebarGroup key={g.label ?? `sin-titulo-${i}`}>
                {g.label && (
                  // `eyebrow` (globals.css) da las mayúsculas espaciadas del spec, pero
                  // también fija color:var(--muted-foreground) (4.84:1) — más flojo que
                  // el text-sidebar-foreground/70 que ya tenía el default de la
                  // primitiva (7.87:1). Se vuelve a pisar el color después.
                  <SidebarGroupLabel className="eyebrow text-sidebar-foreground/70">
                    {g.label}
                  </SidebarGroupLabel>
                )}
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
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}
