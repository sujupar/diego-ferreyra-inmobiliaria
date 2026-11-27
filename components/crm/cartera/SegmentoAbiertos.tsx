import { miles } from '@/lib/crm/cartera-pantalla'
import { cn } from '@/lib/utils'

// "Abiertos N / Cerrados N" (maqueta `segmento()`, `.cartera-seg`). Es el ÚNICO lugar de
// arriba que dice el total (spec "El total no se repite"). Sin datos (cargando o error) no
// muestra números: un cero ahí afirmaría algo que no se sabe.

export function SegmentoAbiertos({
  etiquetas,
  numeros,
  valor,
  alCambiar,
  nombreGrupo,
}: {
  etiquetas: [string, string]
  numeros: [number, number] | null
  valor: 'abiertos' | 'cerrados'
  alCambiar: (v: 'abiertos' | 'cerrados') => void
  nombreGrupo: string
}) {
  const opciones = [
    { v: 'abiertos' as const, texto: etiquetas[0], n: numeros?.[0] },
    { v: 'cerrados' as const, texto: etiquetas[1], n: numeros?.[1] },
  ]
  return (
    <div role="group" aria-label={nombreGrupo} className="inline-flex max-w-full self-start gap-0.5 rounded-lg bg-muted p-[3px] md:self-center">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valor === o.v}
          onClick={() => alCambiar(o.v)}
          className={cn(
            'min-h-11 whitespace-nowrap rounded-[calc(var(--radius)-1px)] px-3.5 text-[13px] font-medium text-texto-suave md:raton:min-h-9',
            'aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-sm',
            'outline-none focus-visible:ring-2 focus-visible:ring-brand',
          )}
        >
          {o.texto}
          {o.n !== undefined && <span className="ml-1 font-normal tabular-nums text-texto-suave">{miles(o.n)}</span>}
        </button>
      ))}
    </div>
  )
}
