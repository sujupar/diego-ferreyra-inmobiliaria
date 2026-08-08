import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  /** `null` = no hay dato. NO es lo mismo que 0 y no se muestra como 0. */
  value: string | number | null
  /** Obligatorio: de dónde sale el número. Regla del tablero, no decoración. */
  context: string
  href?: string
  tone?: 'neutral' | 'alerta'
}

export function StatTile({ label, value, context, href, tone = 'neutral' }: Props) {
  const cuerpo = (
    <>
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          'tabular-n mt-1 text-3xl leading-none',
          value === null && 'text-base text-muted-foreground',
          tone === 'alerta' && value !== null && 'text-[color:var(--destructive)]',
        )}
      >
        {value === null ? 'Sin datos' : value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{context}</div>
    </>
  )

  const clases = 'block rounded-xl border bg-card p-4 shadow-sm'
  return href
    ? <Link href={href} className={cn(clases, 'transition-colors hover:bg-secondary')}>{cuerpo}</Link>
    : <div className={clases}>{cuerpo}</div>
}
