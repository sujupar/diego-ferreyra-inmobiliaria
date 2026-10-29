'use client'

import { cn } from '@/lib/utils'
import type { TarjetasBandeja } from '@/lib/consultas/tipos'

export type TarjetaAtender = 'sinVisita' | 'sinPropiedad' | 'telefonoRevisar'

/**
 * Las tres tarjetas "para atender" (spec §3.2). Tocar una aplica su filtro; la
 * activa queda marcada y tocarla otra vez lo saca. En el celular son una fila
 * que scrollea de costado DENTRO de su contenedor: la página no se corre.
 */
export function TarjetasAtender({ tarjetas, activas, etiquetaPeriodo, onTocar }: {
  tarjetas: TarjetasBandeja
  activas: Record<TarjetaAtender, boolean>
  /** "Últimos 7 días", para que el número diga de cuándo es. */
  etiquetaPeriodo: string
  onTocar: (tarjeta: TarjetaAtender) => void
}) {
  const items: Array<{ clave: TarjetaAtender; titulo: string; ayuda: string; color: string; borde: string }> = [
    {
      clave: 'sinVisita', titulo: 'Sin visita todavía',
      ayuda: `${etiquetaPeriodo.toLowerCase()} · tocá para filtrar`,
      color: 'text-brand', borde: 'border-brand/30',
    },
    {
      clave: 'sinPropiedad', titulo: 'Sin propiedad identificada', ayuda: 'no sabemos qué aviso miraron',
      color: 'text-amber-800 dark:text-amber-300', borde: 'border-amber-300/70',
    },
    {
      clave: 'telefonoRevisar', titulo: 'Teléfono a revisar', ayuda: 'incompleto o no es un celular',
      color: 'text-foreground', borde: 'border-border',
    },
  ]

  return (
    <section
      aria-label="Para atender"
      className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:pb-0"
    >
      {items.map((t) => {
        const activa = activas[t.clave]
        return (
          <button
            key={t.clave}
            type="button"
            aria-pressed={activa}
            onClick={() => onTocar(t.clave)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-card px-4 text-left text-sm transition-colors',
              'md:shrink md:flex-col md:items-start md:gap-0.5 md:rounded-xl md:px-4 md:py-3.5',
              t.borde,
              activa && 'border-brand bg-brand-soft ring-1 ring-brand',
            )}
          >
            <span className="whitespace-nowrap text-muted-foreground md:text-[13px]">{t.titulo}</span>
            <span className={cn('font-semibold md:text-2xl md:font-bold', t.color)}>{tarjetas[t.clave]}</span>
            <span className="hidden text-xs text-muted-foreground md:block">{t.ayuda}</span>
          </button>
        )
      })}
    </section>
  )
}
