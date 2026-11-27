'use client'

import { useState } from 'react'
import { ArrowRightLeft, CirclePlay, ListChecks, MessageCircle, UserPlus, type LucideIcon } from 'lucide-react'
import type { ClaseEvento, EventoSistema } from '@/lib/crm/linea-de-tiempo'
import { cn } from '@/lib/utils'
import { FechaRelativa } from '../ui/FechaRelativa'

// Un evento del sistema en la línea de tiempo (crm-linea-de-tiempo D5): la misma anatomía
// que `ItemActividad` (ícono, título que pasa a un segundo renglón, detalle, autor si se
// sabe y fecha que alterna con un toque en el renglón), SIN menú "⋯": un evento del
// sistema no se edita, ni se borra, ni se anula desde la ficha.

/** Los íconos de `TIPOS_EVENTO` de la maqueta aprobada. */
const ICONOS: Record<ClaseEvento, LucideIcon> = {
  registro: UserPlus,
  etapa: ArrowRightLeft,
  tarea: ListChecks,
  whatsapp: MessageCircle,
  video: CirclePlay,
}

export function ItemEvento({ evento: e, ahora }: { evento: EventoSistema; ahora: Date }) {
  const [exacta, setExacta] = useState(false)
  const Icono = ICONOS[e.clase]
  return (
    <li
      data-tipo={e.clase}
      data-evento={e.id}
      className={cn(
        'relative flex min-w-0 gap-3 py-2.5 outline-none',
        "[&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:bottom-[-0.375rem] [&:not(:last-child)]:before:left-[calc(1rem-0.5px)] [&:not(:last-child)]:before:top-[2.875rem] [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-border [&:not(:last-child)]:before:content-['']",
      )}
      onClick={() => setExacta((v) => !v)}
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
        <Icono aria-hidden className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-[0.1875rem]">
        <p
          className={cn('min-w-0 py-0.5 text-sm font-medium leading-[1.35] [overflow-wrap:anywhere]', e.fallido && 'text-destructive-texto')}
          data-titulo
        >
          {e.titulo}
        </p>
        {e.detalle && <p className="text-[13px] text-texto-suave [overflow-wrap:anywhere]">{e.detalle}</p>}
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-texto-suave">
          {e.autor && (
            <>
              <span>{e.autor.nombre}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <FechaRelativa iso={e.fecha} ahora={ahora} exacta={exacta} onAlternar={() => setExacta((v) => !v)} />
        </p>
      </div>
    </li>
  )
}
