'use client'

/**
 * Barra de secciones de la ficha. CAMBIA el contenido — no hace scroll a
 * anclas: al elegir una pestaña, las demás no se renderizan.
 */
import { TAB_LABELS, type TabKey } from '@/lib/properties/detail-view'

interface Props {
  tabs: TabKey[]
  active: TabKey
  onChange: (tab: TabKey) => void
}

/**
 * Distancia al tope = 0, y ahora eso es lo correcto.
 *
 * HISTORIA (importa, para no volver atrás): acá decía `top-14` porque esta barra
 * y el Topbar se pegaban al MISMO scroller —el documento— y con `top-0` esta
 * quedaba íntegramente detrás de los 56px del Topbar, que es opaco: las pestañas
 * eran invisibles E inalcanzables apenas arrancaba el scroll.
 *
 * Desde la cadena de alto del sistema móvil (`app/(dashboard)/layout.tsx`), el
 * scroller ya NO es el documento sino `#contenido`, y el Topbar quedó FUERA de
 * él. O sea que esta barra se pega al techo de su propio panel, adonde el Topbar
 * no llega: con `top-14` dejaría 56px de aire muerto y las pestañas quedarían
 * flotando separadas del borde. El z-index se queda debajo del `z-40` del Topbar
 * igual — ya no compiten, pero no cuesta nada.
 *
 * Si algún día el scroller vuelve a ser el documento, este número tiene que
 * volver a 56px. El test de al lado es el que lo va a decir.
 */
const OFFSET_TOPBAR = 'top-0'

export function PropertyTabsNav({ tabs, active, onChange }: Props) {
  return (
    <div data-testid="barra-secciones" className={`sticky ${OFFSET_TOPBAR} z-30 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-md border-y`}>
      {/*
        `scroll-x-fade` (app/globals.css) y no `overflow-x-auto` a secas.
        Las cinco pestañas suman ~553px y en un teléfono de 390px hay 358:
        "Difusión" e "Historial" arrancan enteras FUERA del borde derecho. Con el
        deslizamiento a secas no había ninguna señal —en iOS la barra de scroll
        es invisible hasta que se toca— y el asesor concluía que la ficha tiene
        tres secciones. La utilidad tapa dos sombras con dos degradados que se
        corren al deslizar: cuando hay más a la derecha, se ve la sombra.

        `--scroll-fade-color`: esos degradados TAPAN las sombras mientras no haya
        nada que deslizar, así que tienen que valer el color de lo que hay
        detrás. Detrás está esta misma franja, que es `bg-background/85` — no una
        tarjeta. Con el `--card` que la utilidad usa por omisión quedaban dos
        parches de 24px en los extremos, a TODOS los anchos (escritorio
        incluido): en claro casi no se notan, en oscuro sí, porque ahí `--card`
        (0.18) y `--background` (0.13) están lejos.
      */}
      <div
        role="tablist"
        aria-label="Secciones de la propiedad"
        className="flex gap-1 scroll-x-fade [--scroll-fade-color:var(--background)]"
      >
        {tabs.map(tab => {
          const isActive = tab === active
          return (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(tab)}
              /* `min-h-11` en celular: con `py-2` la pestaña mide 36px, ocho por
                 debajo del mínimo táctil, y son cinco blancos pegados. */
              className={`px-4 py-2 max-md:min-h-11 rounded-full text-sm whitespace-nowrap transition ${
                isActive
                  ? 'bg-[color:var(--brand)] text-white font-semibold'
                  : 'text-muted-foreground hover:bg-muted font-medium'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
