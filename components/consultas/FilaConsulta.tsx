'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  etiquetaCanal, etiquetaPortal, horaDeLaConsulta, nombreVisible, textoPropiedad, textoTelefono, textoVisita,
} from '@/lib/consultas/pantalla'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'

/** Color de cada portal, el mismo en la fila y en el detalle. */
export function claseDePortal(portal: string): string {
  if (portal === 'zonaprop') return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200'
  if (portal === 'argenprop') return 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200'
  if (portal === 'mercadolibre') return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200'
  return 'bg-muted text-foreground'
}

/**
 * Una consulta en la bandeja (spec §3.2). Tocarla abre el detalle; el botón
 * "Agendar visita" va APARTE (un botón dentro de otro no es HTML válido y el
 * lector de pantalla no sabría cuál de los dos se toca).
 */
export function FilaConsulta({ consulta: c, seleccionada, onAbrir, onAgendar }: {
  consulta: ConsultaEnBandeja
  seleccionada: boolean
  onAbrir: () => void
  onAgendar: () => void
}) {
  const nombre = nombreVisible(c)
  const tel = textoTelefono(c)
  const propiedad = textoPropiedad(c)
  const visita = textoVisita(c)
  const visitaId = c.estado.tipo === 'sin_visita' ? null : c.estado.visitaId

  return (
    <article
      className={cn(
        'flex flex-col gap-3 border-b px-4 py-3 last:border-b-0 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4',
        seleccionada && 'bg-brand-soft/60',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver la consulta de ${nombre}`}
        className="grid min-h-11 min-w-0 gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)] md:gap-4"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{nombre}</span>
            {c.repetidas > 1 && (
              <span className="shrink-0 rounded-full border px-2 py-px text-[11px] text-muted-foreground">{c.repetidas} consultas</span>
            )}
          </span>
          <span className={cn('truncate text-[13px]', tel.revisar ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>
            {tel.texto}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', claseDePortal(c.portal))}>
              {etiquetaPortal(c.portal)}
            </span>
            <span className="text-xs text-muted-foreground">{`${etiquetaCanal(c)} · ${horaDeLaConsulta(c)}`}</span>
          </span>
          <span className={cn('truncate text-sm', propiedad.sinPropiedad && 'text-amber-800 dark:text-amber-300')}>
            {propiedad.texto}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2 md:justify-end">
        {visita && visitaId ? (
          <Link
            href={`/visits/${visitaId}`}
            className="inline-flex min-h-11 items-center rounded-full bg-emerald-50 px-3 text-xs font-medium whitespace-nowrap text-emerald-800 hover:underline dark:bg-emerald-950 dark:text-emerald-200"
          >
            {visita}
          </Link>
        ) : (
          <>
            <span className="hidden rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground md:inline">Sin visita</span>
            <Button type="button" className="min-h-11 flex-1 bg-brand text-brand-foreground hover:bg-brand/90 md:flex-none" onClick={onAgendar}>
              Agendar visita
            </Button>
          </>
        )}
        {c.tel.ok && (
          <a
            href={`https://wa.me/${c.tel.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir WhatsApp de ${nombre}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 md:hidden dark:border-emerald-900 dark:text-emerald-300"
          >
            <MessageCircle aria-hidden="true" className="h-5 w-5" />
          </a>
        )}
      </div>
    </article>
  )
}
