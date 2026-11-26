'use client'

import { useState } from 'react'
import { Calendar, Check, Clock, ListChecks, MessageCircle, Phone, Plus, TriangleAlert } from 'lucide-react'
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog'
import { textoVencimiento } from '@/lib/crm/formato-fecha'
import { leerJson } from '@/lib/crm/leer-json'
import type { TareaDeFicha } from '@/lib/supabase/tasks'
import { cn } from '@/lib/utils'
import { EstadoCarga, EstadoError } from '../ui/EstadoBloque'
import { ALTO_CONTROL } from '../ui/medidas'
import { Tarjeta } from './Tarjeta'

// Bloque Tareas (maqueta `#ficha-tareas` e `itemTarea`): "Tareas · N", "+ Tarea" con el
// formulario de tareas de hoy (AddTaskDialog, sin tocarlo: incluye "Email", diferencia 7)
// y completar con el tilde. Qué tareas se listan lo decide el servidor
// (`tareasVisiblesEnFicha`); si una está vencida lo decide `vencimientoDeTarea`, en hora
// de Argentina, nunca comparando fechas acá.

function IconoTarea({ t }: { t: TareaDeFicha }) {
  const Icono = t.channel === 'call' ? Phone : t.channel === 'message' ? MessageCircle : ListChecks
  return <Icono aria-hidden className="mt-[0.1875rem] size-3.5 shrink-0 text-texto-suave" />
}

function Vence({ t, ahora }: { t: TareaDeFicha; ahora: Date }) {
  const v = textoVencimiento(t, ahora)
  const Icono = v.estado === 'vencida' ? TriangleAlert : v.estado === 'sinfecha' ? Calendar : Clock
  return (
    <span
      data-estado={v.estado}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap',
        v.estado === 'vencida' && 'font-semibold text-destructive-texto',
        v.estado === 'hoy' && 'font-medium text-brand',
      )}
    >
      <Icono aria-hidden className="size-3" />
      {v.texto}
    </span>
  )
}

export function LateralTareas({
  contactoId,
  nombre,
  estado,
  tareas,
  ahora,
  onReintentar,
  onCreada,
  onCompletada,
  avisar,
}: {
  contactoId: string
  nombre: string | null
  estado: 'cargando' | 'ok' | 'error'
  tareas: TareaDeFicha[]
  ahora: Date
  onReintentar: () => void
  onCreada: () => void
  onCompletada: (id: string) => void
  avisar: (texto: string, error?: boolean) => void
}) {
  const [completando, setCompletando] = useState<string | null>(null)
  const completar = async (t: TareaDeFicha) => {
    if (completando) return
    setCompletando(t.id)
    try {
      const r = await leerJson<{ success: boolean }>(
        await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete' }),
        }),
      )
      if (r.ok) onCompletada(t.id)
      else avisar(`No se pudo completar la tarea: ${r.error}`, true)
    } catch (err) {
      console.error('[ficha] no se pudo completar la tarea', err)
      avisar('No se pudo completar la tarea. Probá de nuevo.', true)
    } finally {
      setCompletando(null)
    }
  }

  const n = estado === 'ok' ? tareas.length : null
  const boton = (
    <AddTaskDialog
      entity={{ kind: 'contact', id: contactoId, label: nombre ?? undefined }}
      onCreated={() => onCreada()}
      trigger={
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium shadow-xs hover:bg-accent',
            ALTO_CONTROL,
          )}
        >
          <Plus aria-hidden className="size-4" />
          Tarea
        </button>
      }
    />
  )
  return (
    <Tarjeta
      data-bloque="tareas"
      titulo={
        <>
          Tareas
          {n !== null && n > 0 && <span className="font-normal tabular-nums text-texto-suave"> · {n}</span>}
        </>
      }
      accion={boton}
    >
      {estado === 'error' ? (
        <EstadoError onReintentar={onReintentar} />
      ) : estado === 'cargando' ? (
        <EstadoCarga filas={2} />
      ) : tareas.length === 0 ? null : (
        <ul className="-my-1 flex flex-col divide-y divide-border">
          {tareas.map((t) => (
            <li key={t.id} className="flex min-w-0 items-start gap-1 py-1" data-tarea={t.id}>
              <label className="relative -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full">
                <input
                  type="checkbox"
                  className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
                  aria-label={`Completar: ${t.title}`}
                  disabled={completando === t.id}
                  checked={completando === t.id}
                  onChange={() => completar(t)}
                />
                <span className="flex size-[1.375rem] items-center justify-center rounded-full border-2 border-muted-foreground/70 bg-card text-transparent peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
                  <Check aria-hidden className="size-[0.8125rem]" strokeWidth={3} />
                </span>
              </label>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-[0.5625rem]">
                <p className="flex min-w-0 items-start gap-1.5 text-sm font-medium leading-snug">
                  <IconoTarea t={t} />
                  <span className="min-w-0">{t.title}</span>
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-texto-suave">
                  <Vence t={t} ahora={ahora} />
                  {t.assigned_name && <span>{t.assigned_name}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}
