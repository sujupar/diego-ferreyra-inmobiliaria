'use client'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { cn } from '@/lib/utils'

export interface Asesor { id: string; full_name: string }

/**
 * Ronda 1, ítem 5: la lista de asesores se carga UNA vez en el armazón
 * (`AgendarVisitaDialog`) — este paso ya no hace su propio fetch. El nombre
 * del elegido también se resuelve arriba (useMemo sobre esta misma lista),
 * así solo hay una fuente de verdad y una sola llamada por apertura.
 *
 * Ronda 2, ítem 2: ante un error, `onReintentar` (que vive en el armazón,
 * donde está el fetch) vuelve a pedir la lista — antes el paso quedaba sin
 * salida con solo "Probá de nuevo" y nada para tocar.
 */
export function PasoAsesor({ estado, despachar, asesores, cargando, error, onReintentar }: {
  estado: EstadoAgendar
  despachar: (a: AccionAgendar) => void
  asesores: Asesor[]
  cargando: boolean
  error: boolean
  onReintentar: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 tabIndex={-1} className="text-xl font-semibold outline-none">¿Quién la muestra?</h2>
      {cargando && <p className="text-sm text-muted-foreground">Cargando asesores…</p>}
      {error && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">No pudimos cargar los asesores. Probá de nuevo.</p>
          <button type="button" onClick={onReintentar} className="h-11 rounded-lg border px-3 text-sm">Reintentar</button>
        </div>
      )}
      {!cargando && !error && asesores.length === 0 && <p className="text-sm text-muted-foreground">No hay asesores disponibles.</p>}
      {!cargando && !error && asesores.length > 0 && (
        <div role="radiogroup" aria-label="Asesor" className="grid gap-2 sm:grid-cols-2">
          {asesores.map(a => (
            <button key={a.id} type="button" role="radio" aria-checked={estado.asesorId === a.id}
              onClick={() => despachar({ tipo: 'elegirAsesor', asesorId: a.id })}
              className={cn('flex min-h-14 items-center gap-3 rounded-xl px-4 text-left',
                estado.asesorId === a.id ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
              <span className="font-semibold">{a.full_name}</span>
              {estado.propiedad?.asesorId === a.id && <span className="text-xs text-muted-foreground">asesor de la propiedad</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
