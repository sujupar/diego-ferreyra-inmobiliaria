'use client'
import { construirInstante, formatearFechaLarga } from '@/lib/visitas/horario'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'

export function PasoConfirmar({ estado, despachar, nombreAsesor, duplicado, error }: {
  estado: EstadoAgendar
  despachar: (a: AccionAgendar) => void
  nombreAsesor: string | null
  duplicado: { scheduled_at: string } | null
  error: string | null
}) {
  const instante = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
  const persona = estado.persona
  const filas: Array<[string, string]> = [
    ['Propiedad', estado.propiedad?.address ?? '—'],
    ['Origen', estado.origen ? `${ORIGEN_INFO[estado.origen].etiqueta}${estado.origenDetalle.trim() ? ` · ${estado.origenDetalle.trim()}` : ''}` : '—'],
    ['Persona', persona ? `${persona.nombre}${persona.tipo === 'nueva' ? ` · ${persona.telefono}` : ` · ${persona.telefono ?? estado.telefonoFaltante}`}` : '—'],
    ['Cuándo', instante ? formatearFechaLarga(instante) : '—'],
    ['Asesor', nombreAsesor ?? '—'],
  ]
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Revisá y agendá</h2>
      <dl className="divide-y rounded-xl border bg-card">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Ya está confirmada con la persona?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[{ v: true, t: 'Sí, confirmada' }, { v: false, t: 'No, a confirmar' }].map(o => (
            <button key={String(o.v)} type="button" aria-pressed={estado.confirmada === o.v}
              onClick={() => despachar({ tipo: 'confirmada', valor: o.v })}
              className={estado.confirmada === o.v ? 'h-11 rounded-lg border-2 border-brand bg-brand-soft/40 font-semibold' : 'h-11 rounded-lg border bg-card'}>
              {o.t}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span>Notas (opcional)</span>
        <textarea value={estado.notas} maxLength={1000} onChange={e => despachar({ tipo: 'notas', texto: e.target.value })}
          className="min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-base" />
      </label>
      {duplicado && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Esta persona ya tiene una visita el {formatearFechaLarga(duplicado.scheduled_at)}. Si igual querés agendar otra, tocá “Agendar igual”.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
