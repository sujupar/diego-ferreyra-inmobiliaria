import Link from 'next/link'
import { EstadoVisitaBadge } from '@/components/visitas/EstadoVisitaBadge'
import { formatearFechaHora, horaEnArgentina } from '@/lib/visitas/horario'
import { etiquetaDeOrigen } from '@/lib/visitas/presentacion'
import type { VisitaListado } from '@/lib/visitas/tipos'

/**
 * Una visita como fila tocable (agenda, "requieren tu acción", pestaña de la ficha).
 * Toda la fila lleva a la ficha de la visita y mide ≥ 44 px; las acciones (si hay) van
 * DEBAJO, fuera del link, para que tocarlas no navegue.
 */
export function FilaVisita({ visita, cuando = 'fecha', mostrarAsesor, mostrarPropiedad = true, children }: {
  visita: VisitaListado
  cuando?: 'hora' | 'fecha'
  mostrarAsesor: boolean
  mostrarPropiedad?: boolean
  children?: React.ReactNode
}) {
  const momento = cuando === 'hora' ? horaEnArgentina(new Date(visita.scheduled_at)) : formatearFechaHora(visita.scheduled_at)
  const datos = [
    visita.client_name || 'Sin nombre',
    etiquetaDeOrigen(visita.origin, visita.origin_detail),
    mostrarAsesor ? (visita.asesor_nombre ?? 'Sin asesor') : null,
  ].filter((t): t is string => t !== null).join(' · ')
  return (
    <li className="rounded-lg border bg-card p-3">
      <Link
        href={`/visits/${visita.id}`}
        className="flex min-h-11 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="min-w-0">
          <span className="font-medium tabular-nums">{momento}</span>
          {mostrarPropiedad && <span className="block break-words">{visita.direccion ?? 'Propiedad sin dirección'}</span>}
          <span className="block break-words text-sm text-muted-foreground">{datos}</span>
        </span>
        <EstadoVisitaBadge estado={visita.status} />
      </Link>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </li>
  )
}
