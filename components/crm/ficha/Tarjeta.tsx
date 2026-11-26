import { cn } from '@/lib/utils'

// Tarjeta de la ficha (maqueta `.card`, `.card__cabecera`, `.card__titulo`). No se usa
// `components/ui/card` porque ese trae `py-6 gap-6` y la ficha es más apretada.
export function Tarjeta({
  titulo,
  accion,
  children,
  className,
  ...resto
}: {
  titulo?: React.ReactNode
  accion?: React.ReactNode
  children?: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('min-w-0 rounded-[calc(var(--radius)+4px)] border border-border bg-card text-card-foreground shadow-xs', className)} {...resto}>
      {(titulo || accion) && (
        <div className="flex min-h-11 items-center gap-2 px-4 pt-3.5">
          {titulo && <h2 className="min-w-0 flex-1 text-sm font-semibold">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div className={cn('flex flex-col gap-3 p-4', (titulo || accion) && 'pt-2.5')}>{children}</div>
      )}
    </section>
  )
}

/** Renglón etiqueta/valor (maqueta `.dato`). Sin valor no se dibuja. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex min-w-0 items-baseline gap-3 py-[0.3125rem]" data-dato={etiqueta}>
      <span className="w-[5.25rem] shrink-0 text-xs text-texto-suave">{etiqueta}</span>
      <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{children}</span>
    </div>
  )
}
