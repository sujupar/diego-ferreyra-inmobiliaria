'use client'

/**
 * Día y hora en botones (diseño A del lienzo, paso "¿Cuándo?"). Un toque por
 * dato; "Otro día u horario" abre los campos nativos (los del sistema: en el
 * celular abren su propio selector, mejor que cualquier calendario dibujado).
 * Lo usan la ventana de agendar y "Reprogramar".
 */
import { useState } from 'react'
import { Clock } from 'lucide-react'
import { diasParaElegir, HORARIOS_SUGERIDOS } from '@/lib/visitas/horario'
import { cn } from '@/lib/utils'

interface Props {
  hoy: string
  fecha: string | null
  hora: string | null
  onFecha: (fecha: string) => void
  onHora: (hora: string) => void
  avisos: string[]
}

export function SelectorDiaHora({ hoy, fecha, hora, onFecha, onHora, avisos }: Props) {
  const dias = diasParaElegir(hoy, 7)
  const fechaFueraDeLista = fecha !== null && !dias.some(d => d.fecha === fecha)
  const horaFueraDeLista = hora !== null && !HORARIOS_SUGERIDOS.includes(hora)
  const [libre, setLibre] = useState(fechaFueraDeLista || horaFueraDeLista)

  // El padre puede cambiar `fecha`/`hora` DESPUÉS del montaje (ej. al cargar
  // un valor guardado o al elegir "Reprogramar" con un horario fuera de lista)
  // a algo que no está en los botones. El `useState` inicial solo corre una
  // vez: sin este ajuste, ese valor queda guardado pero invisible, con el
  // campo libre cerrado. Se hace DURANTE el render, no en un `useEffect`
  // (`react-hooks/set-state-in-effect` lo prohíbe por las re-renderizaciones
  // en cascada) — patrón "Adjusting state while rendering" de React: React
  // detecta el setState y repite el render antes de pintar, sin pasar por un
  // efecto. Solo ABRE — nunca lo cierra solo (si el usuario ya lo abrió a
  // mano, o quedó abierto por esto, no se le cierra por abajo).
  if ((fechaFueraDeLista || horaFueraDeLista) && !libre) {
    setLibre(true)
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Día" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {dias.map(d => (
          <button
            key={d.fecha}
            type="button"
            aria-pressed={fecha === d.fecha}
            onClick={() => onFecha(d.fecha)}
            className={cn(
              'flex h-16 flex-col items-center justify-center rounded-xl border text-sm transition-colors',
              fecha === d.fecha ? 'border-transparent bg-foreground text-background' : 'bg-card hover:bg-secondary',
            )}
          >
            <span className="text-xs">{d.etiqueta}</span>
            <span className="text-lg font-semibold tabular-nums">{d.numero}</span>
          </button>
        ))}
      </div>

      <div role="group" aria-label="Hora" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {HORARIOS_SUGERIDOS.map(h => (
          <button
            key={h}
            type="button"
            aria-pressed={hora === h}
            onClick={() => onHora(h)}
            className={cn(
              'h-11 rounded-lg border font-mono text-sm tabular-nums transition-colors',
              hora === h ? 'border-transparent bg-brand text-brand-foreground' : 'bg-card hover:bg-secondary',
            )}
          >
            {h}
          </button>
        ))}
      </div>

      {libre ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Otro día</span>
            <input type="date" value={fecha ?? ''} onChange={e => e.target.value && onFecha(e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Otro horario</span>
            <input type="time" step={300} value={hora ?? ''} onChange={e => e.target.value && onHora(e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => setLibre(true)} className="text-sm text-brand underline-offset-4 hover:underline">
          Otro día u horario
        </button>
      )}

      <div role="status" aria-live="polite">
        {avisos.map(a => (
          <p key={a} className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{a}
          </p>
        ))}
      </div>
    </div>
  )
}
