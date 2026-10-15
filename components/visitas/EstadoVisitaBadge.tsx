import { Badge } from '@/components/ui/badge'
import { ESTADO_ETIQUETA, type EstadoVisita } from '@/lib/visitas/transiciones'

/** Insignia de estado de una visita. Una sola para todas las listas: el color no es el único canal (dice el estado). */
const COLOR: Record<EstadoVisita, string> = {
  pending_confirmation: 'bg-amber-100 text-amber-900',
  scheduled: 'bg-blue-100 text-blue-900',
  completed: 'bg-green-100 text-green-900',
  no_show: 'bg-orange-100 text-orange-900',
  cancelled: 'bg-muted text-muted-foreground',
}

export function EstadoVisitaBadge({ estado }: { estado: EstadoVisita }) {
  return (
    <Badge variant="outline" className={`shrink-0 border-transparent ${COLOR[estado]}`}>
      {ESTADO_ETIQUETA[estado]}
    </Badge>
  )
}
