import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  /** `null` = no hay dato. NO es lo mismo que 0 y no se muestra como 0. Igual que `NaN`. */
  value: string | number | null
  /** Obligatorio: de dónde sale el número. Regla del tablero, no decoración. */
  context: string
  href?: string
  tone?: 'neutral' | 'alerta'
}

export function StatTile({ label, value, context, href, tone = 'neutral' }: Props) {
  // M1: validar context no vacío — solo en desarrollo
  if (typeof context === 'string' && context.trim() === '') {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('StatTile: context no puede estar vacío. Pasó una cadena en blanco.')
    }
  }

  // M2+3: tratar NaN, Infinity, -Infinity como null (son "sin datos" legítimos de cálculo)
  const normalizedValue = typeof value === 'number' && !Number.isFinite(value) ? null : value

  const cuerpo = (
    <>
      {/* `break-words` en las tres capas: a 320px la tarjeta deja ~106px útiles
          y la etiqueta va en `eyebrow` — mayúsculas con `letter-spacing:.14em`,
          o sea una palabra sin puntos de corte más ancha que su caja. Sin esto
          "PROPIEDADES" desborda el borde en vez de partirse. */}
      <div className="eyebrow break-words">{label}</div>
      <div
        className={cn(
          'tabular-n mt-1 text-3xl leading-none flex items-baseline gap-2 min-w-0 break-words',
          normalizedValue === null && 'text-base text-muted-foreground',
          tone === 'alerta' && normalizedValue !== null && 'text-[color:var(--destructive)]',
        )}
      >
        {/* I1: segundo canal de alerta (ícono + texto accesible) para dos grupos */}
        {tone === 'alerta' && normalizedValue !== null && (
          <>
            <AlertCircle className="w-5 h-5 shrink-0 text-[color:var(--destructive)]" />
            <span className="sr-only">Alerta: </span>
          </>
        )}
        {normalizedValue === null ? 'Sin datos' : normalizedValue}
      </div>
      <div className="mt-2 text-xs text-muted-foreground break-words">{context}</div>
    </>
  )

  // `h-full`: las tarjetas viven en grillas de 2 columnas en celular
  // (`/inicio`, `/properties`). Sin esto, la que tiene la etiqueta o el
  // contexto más corto queda más baja que su vecina y la fila se ve rota.
  // `min-w-0` es lo que habilita el `break-words` de adentro dentro de una
  // celda de grilla.
  const clases = 'block h-full min-w-0 rounded-xl border bg-card p-4 shadow-sm'
  return href
    ? <Link href={href} className={cn(clases, 'transition-colors hover:bg-secondary')}>{cuerpo}</Link>
    : <div className={clases}>{cuerpo}</div>
}
