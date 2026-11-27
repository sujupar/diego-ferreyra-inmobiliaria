import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL_LISTA, LETRA_CAMPO_LISTA } from './medidas'

// Un filtro con su nombre ARRIBA (spec crm-sistema-diseno "Filtros con nombre"). Es un
// `<select>` nativo a propósito: en el celular abre el selector del sistema, que es el que
// la persona ya sabe usar. 44 px y 16 px en táctil (si no, el iPhone hace zoom al tocarlo).
//
// `min-w-0 w-full`: un `<select>` mide su opción más larga y, dentro de un flex, empuja el
// ancho de la página (CLAUDE.md, "Sistema de visitas — Entrega 2": 419 px en un teléfono de 360).
export function CampoSelect<V extends string>({
  etiqueta,
  valor,
  opciones,
  alCambiar,
  className,
  refSelect,
  enLinea = false,
}: {
  etiqueta: string
  valor: V
  opciones: { valor: V; etiqueta: string }[]
  alCambiar: (v: V) => void
  className?: string
  refSelect?: React.Ref<HTMLSelectElement>
  /** Nombre a la izquierda en vez de arriba ("Ordenar por", en la cabecera de una lista). */
  enLinea?: boolean
}) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0', enLinea ? 'items-center gap-2' : 'flex-col gap-1', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-texto-suave', enLinea && 'shrink-0')}>
        {etiqueta}
      </label>
      <span className="relative block min-w-0">
        <select
          id={id}
          ref={refSelect}
          value={valor}
          onChange={(e) => {
            const elegido = opciones.find((o) => o.valor === e.target.value)
            if (elegido) alCambiar(elegido.valor)
          }}
          className={cn(
            'w-full min-w-0 max-w-full appearance-none truncate rounded-md border border-input bg-card pl-3 pr-8 shadow-xs',
            'outline-none focus-visible:ring-2 focus-visible:ring-brand',
            ALTO_CONTROL_LISTA,
            LETRA_CAMPO_LISTA,
          )}
        >
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-texto-suave" />
      </span>
    </div>
  )
}
