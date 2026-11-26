import { cn } from '@/lib/utils'
import type { ResultadoLlamada } from '@/lib/crm/tipos'
import { RESULTADOS_UI } from './resultados'

// Chip del resultado de una llamada (maqueta `.resultado`): cinco estilos, siempre
// ícono + texto, así el resultado se lee sin depender del color.
const ESTILO: Record<ResultadoLlamada, string> = {
  agendo: 'bg-brand text-brand-foreground',
  volver_a_llamar: 'bg-brand-soft text-brand',
  no_interesa: 'bg-secondary text-foreground border-border',
  no_atendio: 'bg-destructive-suave text-destructive-texto',
  numero_equivocado: 'bg-transparent text-texto-suave border-dashed border-muted-foreground/55',
}

export function ChipResultado({ resultado, largo = false }: { resultado: ResultadoLlamada; largo?: boolean }) {
  const r = RESULTADOS_UI[resultado]
  return (
    <span
      data-resultado={resultado}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-[0.3125rem] whitespace-nowrap rounded-sm border border-transparent pl-[0.4375rem] pr-2 text-xs font-medium leading-none',
        ESTILO[resultado],
      )}
    >
      <r.Icono aria-hidden className="size-[0.8125rem]" />
      {largo ? r.texto : r.corto}
    </span>
  )
}
