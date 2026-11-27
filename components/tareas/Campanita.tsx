'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bell, CalendarDays, Check, Clock, ListChecks, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { leerJson } from '@/lib/crm/leer-json'
import type { TareaDeAgenda } from '@/lib/supabase/agenda-tareas'
import { cn } from '@/lib/utils'
import { completarTarea, EVENTO_CAMBIO, reabrirTareaPedida } from './acciones'
import { HojaPosponer, type TareaAPosponer } from './HojaPosponer'
import { ICONO_TIPO } from './NuevaTarea'

// La campanita (spec crm-sistema-diseno "Campanita" y tareas-avisos): número de lo que
// suena para quien está conectado, panel con "Vencidas", "Ahora" y "Lo que viene". Se
// vuelve a leer cada minuto con la pestaña a la vista, al volver a la pestaña y ante
// `tareas:cambio`. Si una lectura falla, queda el último número (nunca un cero falso).

export const INTERVALO_MS = 60_000

interface Avisos {
  vencidas: TareaDeAgenda[]
  ahora: TareaDeAgenda[]
  loQueViene: TareaDeAgenda[]
  total: number
}

export function etiquetaCampanita(total: number): string {
  if (total === 0) return 'Avisos: todo al día'
  return total === 1 ? 'Avisos: 1 tarea para ahora' : `Avisos: ${total} tareas para ahora`
}

const BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'

function Aviso({
  t,
  conAcciones,
  onCompletar,
  onPosponer,
  hecho,
}: {
  t: TareaDeAgenda
  conAcciones: boolean
  onCompletar?: () => void
  onPosponer?: () => void
  hecho?: boolean
}) {
  const Icono = ICONO_TIPO[t.tipo]
  return (
    <li className={cn('flex flex-col gap-2 py-3', hecho && 'opacity-50')} data-aviso={t.id}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-suave" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={t.enlace} className={cn('text-sm font-medium leading-snug [overflow-wrap:anywhere] hover:underline', hecho && 'line-through')}>
            {t.title}
          </Link>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-texto-suave">
            <span className={cn(t.vencimiento.estado === 'vencida' && 'text-destructive-texto')}>{t.vencimiento.texto}</span>
            {t.contacto && (
              <>
                <span aria-hidden>·</span>
                <Link href={`/contacts/${t.contacto.id}`} className="underline decoration-dotted underline-offset-2">
                  {t.contacto.nombre}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      {conAcciones && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={cn(BOTON, 'h-11 border border-border bg-card hover:bg-accent raton:h-9')} disabled={hecho} onClick={onCompletar}>
            <Check aria-hidden className="size-4" /> Completar
          </button>
          <button type="button" className={cn(BOTON, 'h-11 hover:bg-accent raton:h-9')} disabled={hecho} onClick={onPosponer}>
            <Clock aria-hidden className="size-4" /> Posponer
          </button>
        </div>
      )}
    </li>
  )
}

function Grupo({ titulo, Icono, tono, children }: { titulo: string; Icono: typeof Bell; tono: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', tono)}>
        <Icono aria-hidden className="size-3.5" /> {titulo}
      </h3>
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </section>
  )
}

export function Campanita({ intervaloMs = INTERVALO_MS }: { intervaloMs?: number }) {
  const [avisos, setAvisos] = useState<Avisos | null>(null)
  const [fallo, setFallo] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [posponiendo, setPosponiendo] = useState<TareaAPosponer | null>(null)
  const [hechas, setHechas] = useState<Set<string>>(new Set())
  const refBoton = useRef<HTMLButtonElement>(null)
  const refPanel = useRef<HTMLDivElement>(null)

  const leer = useCallback(async () => {
    try {
      const r = await leerJson<Avisos>(await fetch('/api/tasks/avisos', { cache: 'no-store' }))
      if (r.ok) {
        setAvisos(r.data)
        setFallo(false)
        setHechas(new Set())
      } else setFallo(true)
    } catch (err) {
      console.error('[campanita] no se pudieron leer los avisos', err)
      setFallo(true)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- suscripción a la red: el estado cambia después del pedido
    void leer()
    const tic = setInterval(() => {
      if (document.visibilityState === 'visible') void leer()
    }, intervaloMs)
    const alVolver = () => document.visibilityState === 'visible' && void leer()
    const alCambiar = () => void leer()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener(EVENTO_CAMBIO, alCambiar)
    return () => {
      clearInterval(tic)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener(EVENTO_CAMBIO, alCambiar)
    }
  }, [leer, intervaloMs])

  // Escape cierra; en la compu, tocar afuera también (el panel no oscurece el fondo).
  useEffect(() => {
    if (!abierto || posponiendo) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    const afuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (refPanel.current?.contains(t) || refBoton.current?.contains(t)) return
      setAbierto(false)
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('pointerdown', afuera)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('pointerdown', afuera)
    }
  }, [abierto, posponiendo])

  const total = avisos?.total ?? 0
  const completar = async (t: TareaDeAgenda) => {
    setHechas((h) => new Set(h).add(t.id))
    const r = await completarTarea(t.id)
    if (!r.ok) {
      setHechas((h) => {
        const n = new Set(h)
        n.delete(t.id)
        return n
      })
      toast.error(r.error)
      return
    }
    toast('Tarea completada', {
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const d = await reabrirTareaPedida(t.id)
          if (d.ok) toast('Listo, se deshizo.')
          else toast.error(d.error)
        },
      },
    })
  }
  const posponer = (t: TareaDeAgenda) =>
    setPosponiendo({ id: t.id, title: t.title, due_date: t.due_date, due_time: t.due_time, vencimiento: t.vencimiento.texto })

  const nada = avisos !== null && avisos.vencidas.length === 0 && avisos.ahora.length === 0
  return (
    <>
      <button
        ref={refBoton}
        type="button"
        aria-label={etiquetaCampanita(total)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="relative inline-flex size-11 items-center justify-center rounded-md hover:bg-accent raton:size-9"
        data-campanita
      >
        <Bell aria-hidden className="size-5" />
        {total > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-white"
            data-numero
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <div
          ref={refPanel}
          role="dialog"
          aria-label={total > 0 ? `Avisos · ${total}` : 'Avisos'}
          className={cn(
            'fixed inset-0 z-[45] flex flex-col bg-card',
            'md:inset-auto md:top-[calc(var(--topbar-h,3.5rem)+0.25rem)] md:right-4 md:max-h-[min(36rem,calc(100dvh-var(--topbar-h,3.5rem)-1rem))] md:w-96 md:rounded-lg md:border md:border-border md:shadow-lg',
          )}
          data-panel-avisos
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2">
            <h2 className="min-w-0 flex-1 text-base font-semibold">{total > 0 ? `Avisos · ${total}` : 'Avisos'}</h2>
            <button type="button" aria-label="Cerrar los avisos" onClick={() => setAbierto(false)} className="inline-flex size-11 items-center justify-center rounded-md hover:bg-accent raton:size-9">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
            {fallo && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <TriangleAlert aria-hidden className="size-4 text-destructive-texto" /> No se pudieron actualizar los avisos
                </span>
                <button type="button" className={cn(BOTON, 'h-11 border border-border bg-card px-3 hover:bg-accent raton:h-9')} onClick={() => void leer()}>
                  <RefreshCw aria-hidden className="size-4" /> Reintentar
                </button>
              </div>
            )}
            {avisos === null && !fallo && <p className="text-sm text-texto-suave">Cargando…</p>}
            {avisos && avisos.vencidas.length > 0 && (
              <Grupo titulo={`Vencidas · ${avisos.vencidas.length}`} Icono={TriangleAlert} tono="text-destructive-texto">
                {avisos.vencidas.map((t) => (
                  <Aviso key={t.id} t={t} conAcciones hecho={hechas.has(t.id)} onCompletar={() => void completar(t)} onPosponer={() => posponer(t)} />
                ))}
              </Grupo>
            )}
            {avisos && avisos.ahora.length > 0 && (
              <Grupo titulo={`Ahora · ${avisos.ahora.length}`} Icono={Bell} tono="text-brand">
                {avisos.ahora.map((t) => (
                  <Aviso key={t.id} t={t} conAcciones hecho={hechas.has(t.id)} onCompletar={() => void completar(t)} onPosponer={() => posponer(t)} />
                ))}
              </Grupo>
            )}
            {nada && (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <Check aria-hidden className="size-6 text-texto-suave" />
                <p className="text-sm font-semibold">Estás al día</p>
                <p className="text-sm text-texto-suave">No tenés tareas vencidas ni para ahora.</p>
              </div>
            )}
            {avisos && avisos.loQueViene.length > 0 && (
              <Grupo titulo="Lo que viene · avisa a su hora" Icono={CalendarDays} tono="text-texto-suave">
                {avisos.loQueViene.map((t) => (
                  <Aviso key={t.id} t={t} conAcciones={false} />
                ))}
              </Grupo>
            )}
          </div>
          <div className="shrink-0 border-t border-border p-3">
            <Link href="/tasks" onClick={() => setAbierto(false)} className={cn(BOTON, 'h-11 w-full border border-border bg-card hover:bg-accent raton:h-9')}>
              <ListChecks aria-hidden className="size-4" /> Ver todos los pendientes
            </Link>
          </div>
        </div>
      )}

      <HojaPosponer tarea={posponiendo} onCerrar={() => setPosponiendo(null)} onHecho={() => void leer()} />
    </>
  )
}
