'use client'

import { useState } from 'react'
import { fechaExacta, fechaRelativa } from '@/lib/crm/formato-fecha'
import { cn } from '@/lib/utils'

// Fecha relativa (maqueta `.fecha`): "ayer", "hace 2 h". Al pasar el cursor el `title`
// muestra el día y la hora exactos; al tocarla, cambia por la exacta y un segundo toque
// vuelve a la relativa. Puede manejarla quien la contiene (`exacta` + `onAlternar`): el
// renglón de un registro la alterna tocando cualquier parte de la fila (D5).
export function FechaRelativa({
  iso,
  ahora,
  exacta,
  onAlternar,
  className,
}: {
  iso: string
  ahora?: Date
  exacta?: boolean
  onAlternar?: () => void
  className?: string
}) {
  const [propia, setPropia] = useState(false)
  const controlada = exacta !== undefined
  const mostrarExacta = controlada ? exacta : propia
  const rel = fechaRelativa(iso, ahora ?? new Date())
  const exa = fechaExacta(iso)
  const alternar = () => (controlada ? onAlternar?.() : setPropia((v) => !v))
  return (
    <time
      dateTime={iso}
      title={exa}
      tabIndex={0}
      role="button"
      aria-label={`${rel} (${exa})`}
      data-fecha="relativa"
      onClick={(e) => {
        // Si la fila también alterna al tocarla, el toque en la fecha no tiene que contar dos veces.
        e.stopPropagation()
        alternar()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          alternar()
        }
      }}
      className={cn(
        'relative cursor-pointer whitespace-nowrap rounded-[3px] underline decoration-current/45 decoration-dotted underline-offset-[3px]',
        // Zona tocable de 44 px sin agrandar el dibujo.
        "after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-[max(100%,2.75rem)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
        className,
      )}
    >
      {mostrarExacta ? exa : rel}
    </time>
  )
}
