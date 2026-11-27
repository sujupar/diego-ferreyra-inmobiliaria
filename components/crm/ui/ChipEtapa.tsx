import { cn } from '@/lib/utils'

// Chip de la etapa del proceso (maqueta `.badge.etapa`). La etiqueta es la del CRM
// ("Solicitud", "Coordinada", "Descartado"…): una misma etapa no tiene dos nombres en
// la plataforma (diferencia 12). El texto siempre está: el color solo acompaña.
const ESTILO: Record<string, string> = {
  solicitud: 'bg-brand-soft text-brand',
  coordinada: 'bg-brand text-brand-foreground',
  captada: 'bg-brand text-brand-foreground',
  descartado: 'bg-transparent border-border text-texto-suave',
}

// `neutro`: en una LISTA la etapa es un dato más (punto gris y texto, sin fondo): el color de
// la fila queda para lo vencido y lo de hoy (spec crm-sistema-diseno, "Identidad visual
// existente", modificada por crm-cartera-por-rol). La ficha sigue usando los colores.
export function ChipEtapa({
  clave,
  etiqueta,
  neutro = false,
  className,
}: {
  clave: string
  etiqueta: string
  neutro?: boolean
  className?: string
}) {
  return (
    <span
      data-etapa={clave}
      data-neutro={neutro ? '' : undefined}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2 text-xs font-medium leading-none',
        neutro ? 'border-border bg-transparent text-foreground' : (ESTILO[clave] ?? 'bg-secondary text-foreground'),
        className,
      )}
    >
      <span aria-hidden className={cn('size-[0.4375rem] rounded-full', neutro ? 'bg-muted-foreground' : 'bg-current opacity-90')} />
      {etiqueta}
    </span>
  )
}
