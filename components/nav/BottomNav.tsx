'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useContadorDeLeads } from '@/components/nav/use-contador-leads'
import { itemsBarraInferior, destinoActivo } from '@/lib/nav/bottom-bar'
import type { NavGroup } from '@/lib/nav/sections'

/**
 * La barra de abajo del celular: lo que se usa todo el día, donde llega el
 * pulgar. En `md:` para arriba NO EXISTE (`md:hidden`), y hasta ahí llega su
 * alcance — el menú lateral, la barra superior y las 39 pantallas quedan
 * exactamente como estaban.
 *
 * EL PROBLEMA QUE RESUELVE: la única puerta a la navegación en el teléfono es
 * el botón de arriba a la izquierda, que con una mano obliga a recolocar el
 * aparato. Los cuatro accesos frecuentes bajan a donde el dedo ya está.
 *
 * LO QUE LA HACE NO PERDER NADA: el quinto lugar es "Menú" y abre EL MISMO
 * panel de siempre. Cuatro accesos jamás podrían representar 39 pantallas; la
 * barra no intenta reemplazar al menú, le agrega un atajo a lo frecuente y le
 * da al resto un camino cómodo. Por eso el botón de la barra superior TAMBIÉN
 * se queda: son dos puertas al mismo lugar, y si alguna vez esta falla, la otra
 * sigue ahí.
 *
 * DÓNDE VIVE: como hermano del área de contenido dentro de `SidebarInset` (ver
 * `app/(dashboard)/layout.tsx`), no flotando por encima. Así ocupa su propio
 * lugar en la cadena de alto y no hay una sola pantalla que necesite un relleno
 * abajo para no quedar tapada; los pies pegajosos de los asistentes (`sticky
 * bottom-0`) se pegan al piso del contenido, que ahora termina arriba de la
 * barra.
 */
export function BottomNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setOpenMobile } = useSidebar()
  const esMovil = useIsMobile()

  const items = itemsBarraInferior(groups)
  const activo = destinoActivo(items, pathname)

  // El contador solo se pide si esta barra se está viendo de verdad. En
  // escritorio está oculta por CSS pero igual montada, y sin este freno sumaría
  // una consulta por minuto que nadie mira.
  const leadsNuevos = useContadorDeLeads(esMovil && items.some(i => i.badge === 'inbox'))

  // EL CHAT SE QUEDA CON LA PANTALLA. Con una conversación abierta, el hilo
  // ocupa el teléfono entero y el compositor está pegado al piso: una barra de
  // navegación ahí abajo le roba el lugar al lugar donde se escribe y compite
  // con el botón de enviar. Es la misma decisión que toma cualquier app de
  // mensajería. Al volver a la lista, la barra vuelve.
  const chatAbierto = pathname.startsWith('/inbox') && Boolean(searchParams.get('chat'))
  if (items.length === 0 || chatAbierto) return null

  return (
    <nav
      aria-label="Accesos rápidos"
      // `md:hidden`: de 768px para arriba esto no se dibuja. `shrink-0` porque
      // es hermano de un contenedor de alto fijo y sin eso el flex lo aplasta.
      // `pb-safe` (globals.css) para no quedar debajo de la barra de gestos.
      className="flex shrink-0 items-stretch border-t bg-background px-1 pt-1 pb-safe md:hidden"
    >
      {items.map(item => {
        const esActivo = item.href === activo
        const conAviso = item.badge === 'inbox' && leadsNuevos > 0
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={esActivo ? 'page' : undefined}
            // Al navegar desde la barra, el panel del menú se cierra si estaba
            // abierto: si no, se navega por detrás de un panel que sigue tapando
            // la pantalla (el mismo defecto que ya se arregló en el menú).
            onClick={() => setOpenMobile(false)}
            className={`relative flex min-h-12 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] leading-tight ${
              esActivo ? 'font-semibold text-brand' : 'text-muted-foreground'
            }`}
          >
            <span className="relative flex items-center justify-center">
              <item.icon className="size-5 shrink-0" aria-hidden="true" />
              {conAviso && (
                // Un punto y no el número: en una celda de ~78px el número
                // compite con la etiqueta y se pierden los dos. Lo que no se
                // puede perder es la señal de que hay algo nuevo; el número
                // exacto está a un toque, adentro del Inbox.
                <span
                  aria-hidden="true"
                  data-testid="aviso-barra-inferior"
                  className="absolute -top-0.5 -right-1.5 size-2 rounded-full bg-brand"
                />
              )}
            </span>
            <span className="max-w-full truncate">{item.label}</span>
            {conAviso && <span className="sr-only">— {leadsNuevos} sin leer</span>}
          </Link>
        )
      })}

      {/* El acceso a TODO lo demás. Sin este botón la barra sería una jaula de
          cuatro pantallas; con él, las 39 quedan a un toque del pulgar. */}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex min-h-12 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] leading-tight text-muted-foreground"
      >
        <Menu className="size-5 shrink-0" aria-hidden="true" />
        <span className="max-w-full truncate">Menú</span>
      </button>
    </nav>
  )
}
