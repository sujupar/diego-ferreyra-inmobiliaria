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

export function ChipEtapa({ clave, etiqueta, className }: { clave: string; etiqueta: string; className?: string }) {
  return (
    <span
      data-etapa={clave}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2 text-xs font-medium leading-none',
        ESTILO[clave] ?? 'bg-secondary text-foreground',
        className,
      )}
    >
      <span aria-hidden className="size-[0.4375rem] rounded-full bg-current opacity-90" />
      {etiqueta}
    </span>
  )
}
