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
 * Distancia al tope = alto de la barra superior del dashboard (`h-14` = 56px,
 * components/dashboard/Topbar.tsx).
 *
 * Las dos barras se pegan al MISMO scroller —el documento: ni `SidebarInset` ni
 * `#contenido` crean contenedor de scroll ni contexto de apilamiento—, así que
 * con `top-0` esta quedaba íntegramente detrás del Topbar, que además es opaco
 * y se comía sus clics: las pestañas eran invisibles E inalcanzables apenas
 * arrancaba el scroll. El z-index se queda DEBAJO del `z-40` del Topbar a
 * propósito: al llegar arriba, la que se tapa es esta.
 *
 * Si algún día aparece un cartel (modo prueba, suplantación) encima del Topbar,
 * este offset tiene que salir de una variable CSS del layout, no de un número.
 */
const OFFSET_TOPBAR = 'top-14'

export function PropertyTabsNav({ tabs, active, onChange }: Props) {
  return (
    <div data-testid="barra-secciones" className={`sticky ${OFFSET_TOPBAR} z-30 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-md border-y`}>
      <div role="tablist" aria-label="Secciones de la propiedad" className="flex gap-1 overflow-x-auto">
        {tabs.map(tab => {
          const isActive = tab === active
          return (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(tab)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition ${
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
