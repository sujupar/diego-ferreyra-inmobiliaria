'use client'
import { formatearFechaHora } from '@/lib/visitas/horario'
import { MOTIVO_ETIQUETA, MOTIVOS_NO_REALIZADA, type MotivoNoRealizada } from '@/lib/visitas/transiciones'
import type { EventoVisitaR } from '@/lib/visitas/tipos'

const TEXTO: Record<string, string> = {
  creada: 'Creada', confirmada: 'Confirmada', reprogramada: 'Reprogramada', realizada: 'Se realizó',
  no_realizada: 'No se realizó', cancelada: 'Cancelada', asesor_cambiado: 'Cambió el asesor',
  reabierta: 'Reabierta', estado_cambiado: 'Cambió el estado',
  encuesta_enviada: 'Se envió la encuesta', encuesta_abierta: 'Abrió la encuesta', encuesta_respondida: 'Respondió la encuesta',
}

/** Guard real en vez de un `as MotivoNoRealizada`: `reason` llega como
 *  `string | null` desde la base (es una columna TEXT), y el trigger SOLO la
 *  escribe con el valor de `outcome_reason` para 'no_realizada'/'cancelada'
 *  (migración 20261010000002, antes 1) — siempre uno de MOTIVOS_NO_REALIZADA —
 *  pero el tipo no lo sabe. Forzarlo con `as` callaría un error real si algún
 *  día el trigger cambia y empieza a escribir otra cosa ahí. */
function esMotivoNoRealizada(valor: string): valor is MotivoNoRealizada {
  return (MOTIVOS_NO_REALIZADA as readonly string[]).includes(valor)
}

function detalle(e: EventoVisitaR): string | null {
  if (e.kind === 'reprogramada' && e.from_scheduled_at && e.to_scheduled_at) {
    return `${formatearFechaHora(e.from_scheduled_at)} → ${formatearFechaHora(e.to_scheduled_at)}`
  }
  if (e.kind === 'asesor_cambiado') return `${e.desde_asesor ?? 'sin asesor'} → ${e.hacia_asesor ?? 'sin asesor'}`
  const nota = e.note?.trim() || null
  if (e.reason) {
    const etiqueta = esMotivoNoRealizada(e.reason) ? MOTIVO_ETIQUETA[e.reason] : e.reason
    // Con "Otro" el texto que escribió el asesor viaja en la nota: mostrar solo la
    // etiqueta lo perdía y el historial decía "Otro" sin decir qué pasó.
    return nota ? `${etiqueta} — ${nota}` : etiqueta
  }
  return nota
}

export function LineaDeTiempo({ eventos }: { eventos: EventoVisitaR[] }) {
  if (eventos.length === 0) return <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
  return (
    <ol className="space-y-3">
      {eventos.map(e => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-medium">{TEXTO[e.kind] ?? e.kind}</span>
            <span className="text-muted-foreground"> · {formatearFechaHora(e.created_at)}{e.actor ? ` · ${e.actor}` : ''}</span>
            {detalle(e) && <span className="block break-words text-muted-foreground">{detalle(e)}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
