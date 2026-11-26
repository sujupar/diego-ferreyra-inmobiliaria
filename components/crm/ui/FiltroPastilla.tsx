'use client'

import { cn } from '@/lib/utils'

// Filtros en pastilla (maqueta `.filtros` / `.filtro`): uno presionado a la vez. Si no
// entran en un renglón bajan al siguiente, nunca desplazan de costado (ficha.css,
// `#ficha-filtros`). 44 px de alto en táctil, 32 px con mouse.
export function FiltroPastilla<V extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
  className,
}: {
  opciones: { valor: V; etiqueta: string }[]
  valor: V | null
  onCambiar: (v: V) => void
  etiqueta: string
  className?: string
}) {
  return (
    <div role="group" aria-label={etiqueta} className={cn('flex flex-wrap gap-1.5', className)}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onCambiar(o.valor)}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-texto-suave raton:min-h-8',
            'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground',
            'outline-none focus-visible:ring-2 focus-visible:ring-brand',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}
