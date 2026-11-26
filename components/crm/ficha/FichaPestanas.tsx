'use client'

import { cn } from '@/lib/utils'

export type PestanaFicha = 'actividad' | 'datos' | 'tareas'

const PESTANAS: { id: PestanaFicha; etiqueta: string }[] = [
  { id: 'actividad', etiqueta: 'Actividad' },
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'tareas', etiqueta: 'Tareas' },
]

// Pestañas de la vista de una columna (maqueta `.pestanas--iguales`). Con dos o tres
// columnas no se ven (`ficha-solo-pestanas`): los tres paneles están a la vista. El
// número de Tareas cuenta lo que se lista; sin tareas (o sin respuesta todavía) no hay número.
export function FichaPestanas({
  activa,
  onCambiar,
  numeroTareas,
}: {
  activa: PestanaFicha
  onCambiar: (p: PestanaFicha) => void
  numeroTareas: number | null
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de la ficha"
      data-solo="pestanas"
      className="ficha-solo-pestanas -mx-4 flex border-b border-border px-2 md:-mx-6 md:px-4"
    >
      {PESTANAS.map((p) => {
        const sel = p.id === activa
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`ficha-tab-${p.id}`}
            aria-selected={sel}
            aria-controls={`ficha-p-${p.id}`}
            tabIndex={sel ? 0 : -1}
            onClick={() => onCambiar(p.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              const i = PESTANAS.findIndex((x) => x.id === activa)
              const sig = PESTANAS[(i + (e.key === 'ArrowRight' ? 1 : PESTANAS.length - 1)) % PESTANAS.length]
              onCambiar(sig.id)
              document.getElementById(`ficha-tab-${sig.id}`)?.focus()
            }}
            className={cn(
              'relative inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium text-texto-suave',
              sel &&
                "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-sm after:bg-brand after:content-['']",
            )}
          >
            {p.etiqueta}
            {p.id === 'tareas' && numeroTareas !== null && numeroTareas > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-foreground">
                {numeroTareas}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
