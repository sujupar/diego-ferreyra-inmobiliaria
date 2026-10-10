'use client'
import { ORIGENES_VISITA, ORIGEN_INFO } from '@/lib/visitas/origen'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { cn } from '@/lib/utils'

export function PasoOrigen({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const info = estado.origen ? ORIGEN_INFO[estado.origen] : null
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 tabIndex={-1} className="text-xl font-semibold outline-none">¿De dónde viene esta visita?</h2>
        <p className="text-sm text-muted-foreground">Con esto sabemos qué canal trae visitas que se concretan.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ORIGENES_VISITA.map(o => (
          <button key={o} type="button" aria-pressed={estado.origen === o}
            onClick={() => despachar({ tipo: 'elegirOrigen', origen: o })}
            className={cn('flex min-h-[76px] flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition-colors',
              estado.origen === o ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
            <span className="font-semibold">{ORIGEN_INFO[o].etiqueta}</span>
            <span className="text-xs text-muted-foreground">{ORIGEN_INFO[o].ayuda}</span>
          </button>
        ))}
      </div>
      {info && info.detalle !== 'no' && (
        <label className="block space-y-1 text-sm">
          <span>{estado.origen === 'otro' ? '¿De dónde vino?' : '¿Cuál publicidad? (opcional)'}</span>
          <input value={estado.origenDetalle} maxLength={120}
            onChange={e => despachar({ tipo: 'detalleOrigen', texto: e.target.value })}
            placeholder={estado.origen === 'otro' ? 'Ej: recomendación de un vecino' : 'Ej: Google'}
            className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
        </label>
      )}
    </div>
  )
}
