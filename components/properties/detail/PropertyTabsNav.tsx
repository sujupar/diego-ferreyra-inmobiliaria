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

export function PropertyTabsNav({ tabs, active, onChange }: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-md border-y">
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
