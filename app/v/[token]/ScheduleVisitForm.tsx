'use client'

/**
 * Agenda SIN pedir datos: el nombre/email/teléfono ya viajan en el token, así
 * que solo se elige día y franja horaria. La visita queda "a confirmar" y la
 * cierra el equipo por teléfono.
 */
import { useState } from 'react'
import { Loader2, CalendarCheck } from 'lucide-react'

const FRANJAS = [
  { id: 'manana', label: 'Por la mañana (9 a 12)' },
  { id: 'mediodia', label: 'Al mediodía (12 a 15)' },
  { id: 'tarde', label: 'Por la tarde (15 a 19)' },
] as const

/**
 * Hoy no: la visita se coordina con al menos un día de anticipación.
 * Se calcula en horario ARGENTINO, no en UTC: con `toISOString()` cualquiera
 * que entre después de las 21:00 ART ya estaría en el día siguiente en UTC y el
 * primer día elegible saltaría a pasado mañana.
 */
function minDate(): string {
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(manana)
}

export function ScheduleVisitForm({ token, clientName }: { token: string; clientName: string }) {
  const [date, setDate] = useState('')
  const [franja, setFranja] = useState<string>(FRANJAS[0].id)
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) {
      setStatus('err')
      setError('Elegí un día para la visita.')
      return
    }
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(`/api/v/${token}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, franja }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'No pudimos registrar la visita')
      setStatus('ok')
    } catch (err) {
      setStatus('err')
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  if (status === 'ok') {
    return (
      <div className="mt-6 flex flex-col items-start gap-2 rounded-lg border p-6">
        <CalendarCheck className="h-8 w-8 text-emerald-600" />
        <p className="text-lg font-medium">¡Listo, {clientName.split(' ')[0]}!</p>
        <p className="text-black/60">
          Nuestro equipo se va a contactar con vos para confirmar la visita a la propiedad.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="v-date">Día</label>
        <input
          id="v-date"
          type="date"
          required
          min={minDate()}
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full max-w-xs rounded-lg border px-3 py-2.5 text-base"
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">Momento del día</legend>
        <div className="flex flex-col gap-2">
          {FRANJAS.map(f => (
            <label key={f.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="franja"
                value={f.id}
                checked={franja === f.id}
                onChange={() => setFranja(f.id)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {status === 'err' && error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium text-white disabled:opacity-60"
        style={{ background: 'var(--brand)' }}
      >
        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
        Agendar visita
      </button>
    </form>
  )
}
