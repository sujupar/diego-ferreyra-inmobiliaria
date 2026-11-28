'use client'

import { useState } from 'react'
import { CalendarCheck, MessageCircle, MoreHorizontal, StickyNote } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MAX_LARGO_TEXTO } from '@/lib/crm/actividades'
import { vencimientoEnHistorial } from '@/lib/crm/formato-fecha'
import { leerJson } from '@/lib/crm/leer-json'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import { cn } from '@/lib/utils'
import { ChipResultado } from '../ui/ChipResultado'
import { FechaRelativa } from '../ui/FechaRelativa'
import { ALTO_CONTROL, LETRA_CAMPO } from '../ui/medidas'
import { RESULTADOS_UI } from '../ui/resultados'

// Un registro de la actividad (maqueta `itemEvento`, anatomía de evento de
// crm-sistema-diseno): ícono, título (hasta dos renglones, nunca cortado con "…"),
// detalle, autor y fecha relativa; tocar CUALQUIER parte del renglón alterna la fecha
// exacta (D5). Lo que la maqueta no tenía y la propuesta pide va en el menú "⋯": Editar
// (en el lugar), Borrar y Anular, que confirman con el Dialog de la plataforma.

const MSG_VACIA = 'Escribí algo para guardar la nota'
const MSG_LARGA = `El texto no puede pasar de ${MAX_LARGO_TEXTO.toLocaleString('es-AR')} caracteres.`

const BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'

function Icono({ a }: { a: ActividadDeFicha }) {
  if (a.kind === 'call' && a.call_outcome) {
    const I = RESULTADOS_UI[a.call_outcome].Icono
    return <I aria-hidden className="size-4" />
  }
  if (a.kind === 'whatsapp_sent') return <MessageCircle aria-hidden className="size-4" />
  return <StickyNote aria-hidden className="size-4" />
}

export function ItemActividad({
  actividad: a,
  ahora,
  nuevo,
  contactoId,
  onEditada,
  onAnular,
  ref,
}: {
  actividad: ActividadDeFicha
  ahora: Date
  nuevo?: boolean
  contactoId: string
  onEditada: (a: ActividadDeFicha) => void
  /** Anula (o borra, si es una nota). Devuelve si se pudo. */
  onAnular: (a: ActividadDeFicha) => Promise<boolean>
  ref?: React.Ref<HTMLLIElement>
}) {
  const [exacta, setExacta] = useState(false)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [anulando, setAnulando] = useState(false)

  const esNota = a.kind === 'note'
  const puedeEditar = esNota && a.puede_editar
  const puedeBorrar = esNota && a.puede_anular
  const puedeAnular = !esNota && a.puede_anular
  const hayMenu = puedeEditar || puedeBorrar || puedeAnular

  const guardarEdicion = async () => {
    const limpio = texto.normalize('NFC').trim()
    if (!limpio) return setError(MSG_VACIA)
    if (limpio.length > MAX_LARGO_TEXTO) return setError(MSG_LARGA)
    setGuardando(true)
    setError(null)
    try {
      const r = await leerJson<{ actividad: ActividadDeFicha }>(
        await fetch(`/api/contacts/${encodeURIComponent(contactoId)}/activities/${encodeURIComponent(a.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'editar', body: limpio }),
        }),
      )
      if (!r.ok) return setError(r.error)
      onEditada(r.data.actividad)
      setEditando(false)
    } catch (err) {
      console.error('[ficha] no se pudo editar la nota', err)
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const titulo =
    a.kind === 'call' && a.call_outcome ? (
      <>
        <span>{a.intento === null ? 'Llamada' : `Llamada ${a.intento}`} ·</span>
        <ChipResultado resultado={a.call_outcome} />
      </>
    ) : (
      <span>{a.titulo}</span>
    )

  return (
    <li
      ref={ref}
      tabIndex={-1}
      data-tipo={a.kind}
      data-actividad={a.id}
      className={cn(
        'relative flex min-w-0 gap-3 py-2.5 outline-none',
        "[&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:bottom-[-0.375rem] [&:not(:last-child)]:before:left-[calc(1rem-0.5px)] [&:not(:last-child)]:before:top-[2.875rem] [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-border [&:not(:last-child)]:before:content-['']",
        nuevo && 'ficha-resaltado',
      )}
      onClick={(e) => {
        // Tocar el renglón alterna la fecha; el menú y la edición no cuentan.
        if (editando) return
        const t = e.target as HTMLElement
        if (t.closest('[data-no-alterna]')) return
        setExacta((v) => !v)
      }}
    >
      <span
        className={cn(
          'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground',
          a.kind === 'call' && 'bg-brand-soft text-brand',
          esNota && 'border border-border bg-card',
        )}
      >
        <Icono a={a} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-[0.1875rem]">
        <div className="flex min-w-0 items-start gap-1">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 py-0.5 text-sm font-medium leading-[1.35]" data-titulo>
            {titulo}
          </p>
          {hayMenu && !editando && (
            <div data-no-alterna>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Más acciones"
                    className={cn('-mt-1 -mr-1 inline-flex size-11 items-center justify-center rounded-md text-texto-suave hover:bg-accent raton:size-8')}
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {puedeEditar && (
                    <DropdownMenuItem
                      className="min-h-11 raton:min-h-8"
                      onSelect={() => {
                        setTexto(a.body ?? '')
                        setError(null)
                        setEditando(true)
                      }}
                    >
                      Editar
                    </DropdownMenuItem>
                  )}
                  {puedeBorrar && (
                    <DropdownMenuItem className="min-h-11 raton:min-h-8" onSelect={() => setConfirmar(true)}>
                      Borrar
                    </DropdownMenuItem>
                  )}
                  {puedeAnular && (
                    <DropdownMenuItem className="min-h-11 raton:min-h-8" onSelect={() => setConfirmar(true)}>
                      Anular
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {editando ? (
          <div data-no-alterna className="flex min-w-0 flex-col gap-2 py-1">
            <textarea
              autoFocus
              aria-label="Editar la nota"
              rows={3}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                if (error) setError(null)
              }}
              aria-invalid={!!error}
              className={cn(
                'min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 leading-snug aria-invalid:border-destructive',
                LETRA_CAMPO,
              )}
            />
            {error && (
              <p role="alert" className="text-xs text-destructive-texto">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent')} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                className={cn(BOTON, ALTO_CONTROL, 'bg-brand text-brand-foreground hover:bg-brand/90')}
                onClick={guardarEdicion}
              >
                Guardar
              </button>
            </div>
          </div>
        ) : (
          a.body && <p className="my-1 whitespace-pre-line rounded-md bg-muted px-2.5 py-2 text-[13px] text-foreground">{a.body}</p>
        )}

        {a.tarea_creada && (
          <p className="flex items-start gap-1.5 text-xs text-texto-suave">
            <CalendarCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>
              Tarea creada sola · {a.tarea_creada.title}
              {a.tarea_creada.due_date ? `, ${vencimientoEnHistorial(a.tarea_creada.due_date, a.tarea_creada.due_time, ahora)}` : ''}
            </span>
          </p>
        )}

        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-texto-suave">
          {a.autor && (
            <>
              <span>{a.autor.nombre || 'Usuario'}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <FechaRelativa iso={a.occurred_at} ahora={ahora} exacta={exacta} onAlternar={() => setExacta((v) => !v)} />
          {a.editada && esNota && (
            <>
              <span aria-hidden>·</span>
              <span>editada</span>
            </>
          )}
        </p>
      </div>

      <Dialog open={confirmar} onOpenChange={(o) => !anulando && setConfirmar(o)}>
        <DialogContent data-no-alterna onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{esNota ? '¿Borrar esta nota?' : '¿Anular este registro?'}</DialogTitle>
            <DialogDescription>
              {esNota
                ? 'Deja de verse en la ficha. Queda guardada en la base con quién la borró.'
                : 'Deja de verse en la ficha y se deshace lo que hizo con las tareas, si fue lo último que se registró.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent')} onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={anulando}
              className={cn(BOTON, ALTO_CONTROL, 'bg-destructive text-white hover:bg-destructive/90')}
              onClick={async () => {
                setAnulando(true)
                const ok = await onAnular(a)
                setAnulando(false)
                if (ok) setConfirmar(false)
              }}
            >
              {esNota ? 'Borrar nota' : 'Anular'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
