'use client'
import { construirInstante, formatearFechaLarga, yaOcurrio } from '@/lib/visitas/horario'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { CLASE_TITULO_PASO } from './titulo-paso'

/**
 * Ronda 1, ítem 12: un duplicado puede ser DOS cosas distintas. Si el
 * `scheduled_at` coincide con el instante pedido, es la MISMA visita (el
 * asesor volvió a tocar "Agendar" sobre algo que ya quedó creado) — no hay
 * "otra" para ofrecer. Si es un horario distinto, es otra visita futura de la
 * misma persona, y ahí sí tiene sentido "Agendar igual".
 */
export interface DuplicadoVisita {
  id: string
  scheduled_at: string
  mismoInstante: boolean
}

export function PasoConfirmar({ estado, despachar, nombreAsesor, duplicado, error }: {
  estado: EstadoAgendar
  despachar: (a: AccionAgendar) => void
  nombreAsesor: string | null
  duplicado: DuplicadoVisita | null
  error: string | null
}) {
  const instante = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
  // Misma regla que el servidor (POST /api/visits): a una visita que ya pasó no se le manda
  // "tu visita está confirmada". Se avisa acá para que no sorprenda; la pregunta de abajo
  // sigue, porque igual queda registrado si estaba confirmada.
  const visitaPasada = yaOcurrio(instante, new Date())
  const persona = estado.persona
  // Ítem 2: el teléfono de una persona de LISTA se muestra solo si es
  // utilizable; si no, lo que cuenta es lo completado a mano (el crudo '123'
  // de una carga vieja es truthy pero no es un teléfono real).
  const telefonoPersona = persona
    ? persona.tipo === 'nueva'
      ? persona.telefono
      : (ultimos10Digitos(persona.telefono) ? persona.telefono : estado.telefonoFaltante)
    : null
  const filas: Array<[string, string]> = [
    ['Propiedad', estado.propiedad?.address ?? '—'],
    ['Origen', estado.origen ? `${ORIGEN_INFO[estado.origen].etiqueta}${estado.origenDetalle.trim() ? ` · ${estado.origenDetalle.trim()}` : ''}` : '—'],
    ['Persona', persona ? `${persona.nombre} · ${telefonoPersona}` : '—'],
    ['Cuándo', instante ? formatearFechaLarga(instante) : '—'],
    ['Asesor', nombreAsesor ?? '—'],
  ]
  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} className={CLASE_TITULO_PASO}>Revisá y agendá</h2>
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
        {visitaPasada && (
          <p className="text-sm text-muted-foreground">Es una visita que ya ocurrió: no le mandamos confirmación a la persona.</p>
        )}
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span>Notas (opcional)</span>
        <textarea value={estado.notas} maxLength={1000} onChange={e => despachar({ tipo: 'notas', texto: e.target.value })}
          className="min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-base" />
      </label>
      {duplicado && duplicado.mismoInstante && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Esta visita ya quedó agendada.{' '}
          <a href={`/visits/${duplicado.id}`} className="font-semibold underline">Ver visita</a>
        </p>
      )}
      {duplicado && !duplicado.mismoInstante && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Esta persona ya tiene una visita el {formatearFechaLarga(duplicado.scheduled_at)}. Si igual querés agendar otra, tocá “Agendar igual”.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
