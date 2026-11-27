'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarDays, Clock, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { leerJson } from '@/lib/crm/leer-json'
import { NOMBRE_TIPO, TIPOS_TAREA, type TipoTarea } from '@/lib/tareas/agenda'
import type { Agenda, TareaDeAgenda } from '@/lib/supabase/agenda-tareas'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL, LETRA_CAMPO } from '@/components/crm/ui/medidas'
import { completarTarea, EVENTO_CAMBIO, reabrirTareaPedida } from './acciones'
import { HojaPosponer, type TareaAPosponer } from './HojaPosponer'
import { ICONO_TIPO, NuevaTarea } from './NuevaTarea'

// Pendientes (maqueta pantallas/tareas.*; spec crm-sistema-diseno "Página de pendientes" y
// tareas): resumen exacto, filtros de tipo y "De quién", Vencidas / Hoy / Próximas y "Sin
// fecha" plegado de a 25. Completar ofrece "Deshacer"; cada fila se pospone o se le pone fecha.

type RespuestaAgenda = Agenda & { de: string; personas: { id: string; nombre: string }[] | null }

const GRUPOS = [
  { clave: 'vencidas', titulo: 'Vencidas', Icono: TriangleAlert, tono: 'text-destructive-texto' },
  { clave: 'hoy', titulo: 'Hoy', Icono: Clock, tono: 'text-brand' },
  { clave: 'proximas', titulo: 'Próximas', Icono: CalendarDays, tono: 'text-texto-suave' },
] as const

const BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'
const CHIP = cn(
  'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm whitespace-nowrap',
  'h-9 aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand',
)

export function tituloDe(de: string, personas: { id: string; nombre: string }[] | null): string {
  if (de === 'mias') return 'Mis pendientes'
  if (de === 'todos') return 'Pendientes del equipo'
  const p = personas?.find((x) => x.id === de)
  return p ? `Pendientes de ${p.nombre}` : 'Pendientes'
}

function Fila({
  t,
  conPersona,
  hecha,
  onCompletar,
  onPosponer,
}: {
  t: TareaDeAgenda
  conPersona: boolean
  hecha: boolean
  onCompletar: () => void
  onPosponer: () => void
}) {
  const Icono = ICONO_TIPO[t.tipo]
  const sinFecha = !t.due_date
  return (
    <li className={cn('flex min-w-0 items-start gap-3 py-3', hecha && 'opacity-50')} data-tarea={t.id}>
      <button
        type="button"
        role="checkbox"
        aria-checked={hecha}
        aria-label={`Completar: ${t.title}`}
        disabled={hecha}
        onClick={onCompletar}
        className="-m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full raton:-m-1 raton:size-7"
      >
        <span aria-hidden className={cn('size-5 rounded-full border-2 border-border bg-card', hecha && 'border-brand bg-brand')} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex min-w-0 items-start gap-1.5 text-sm font-medium leading-snug">
          <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-suave" />
          <Link href={t.enlace} className={cn('min-w-0 [overflow-wrap:anywhere] hover:underline', hecha && 'line-through')}>
            {t.title}
          </Link>
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 pl-5.5 text-xs text-texto-suave">
          <span className={cn(t.vencimiento.estado === 'vencida' && 'text-destructive-texto')}>{t.vencimiento.texto}</span>
          {t.contacto && (
            <>
              <span aria-hidden>·</span>
              <Link href={`/contacts/${t.contacto.id}`} className="underline decoration-dotted underline-offset-2">
                {t.contacto.nombre}
              </Link>
            </>
          )}
          {conPersona && t.asignado && (
            <>
              <span aria-hidden>·</span>
              <span>{t.asignado.nombre}</span>
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onPosponer}
        disabled={hecha}
        aria-label={sinFecha ? `Poner fecha: ${t.title}` : `Posponer: ${t.title}`}
        className={cn(BOTON, 'size-11 shrink-0 hover:bg-accent md:w-auto md:px-3 md:raton:h-9')}
      >
        {sinFecha ? <CalendarDays aria-hidden className="size-4" /> : <Clock aria-hidden className="size-4" />}
        <span className="hidden md:inline">{sinFecha ? 'Poner fecha' : 'Posponer'}</span>
      </button>
    </li>
  )
}

export function Pendientes() {
  const [agenda, setAgenda] = useState<RespuestaAgenda | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')
  const [de, setDe] = useState<string | null>(null) // null = el que elija el servidor
  const [tipo, setTipo] = useState<TipoTarea | null>(null)
  const [sinFechaExtra, setSinFechaExtra] = useState<TareaDeAgenda[]>([])
  const [cargandoMas, setCargandoMas] = useState(false)
  const [hechas, setHechas] = useState<Set<string>>(new Set())
  const [posponiendo, setPosponiendo] = useState<TareaAPosponer | null>(null)
  const [nueva, setNueva] = useState(false)
  const version = useRef(0)

  const pedir = useCallback(async (deP: string | null, tipoP: TipoTarea | null, desde = 0) => {
    const qs = new URLSearchParams()
    if (deP) qs.set('de', deP)
    if (tipoP) qs.set('tipo', tipoP)
    if (desde) qs.set('sin_fecha_desde', String(desde))
    return leerJson<RespuestaAgenda>(await fetch(`/api/tasks/agenda?${qs.toString()}`, { cache: 'no-store' }))
  }, [])

  const cargar = useCallback(async () => {
    const v = ++version.current
    try {
      const r = await pedir(de, tipo)
      if (v !== version.current) return
      if (r.ok) {
        setAgenda(r.data)
        setSinFechaExtra([])
        setHechas(new Set())
        setEstado('ok')
      } else setEstado('error')
    } catch (err) {
      console.error('[pendientes] no se pudieron traer las tareas', err)
      if (v === version.current) setEstado('error')
    }
  }, [pedir, de, tipo])

  useEffect(() => {
    void cargar()
    const alCambiar = () => void cargar()
    window.addEventListener(EVENTO_CAMBIO, alCambiar)
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar)
  }, [cargar])

  const mas = async () => {
    if (!agenda || cargandoMas) return
    setCargandoMas(true)
    try {
      const r = await pedir(de, tipo, agenda.sinFecha.items.length + sinFechaExtra.length)
      if (r.ok) setSinFechaExtra((x) => [...x, ...r.data.sinFecha.items.filter((n) => !x.some((y) => y.id === n.id))])
      else toast.error(r.error)
    } finally {
      setCargandoMas(false)
    }
  }

  const completar = async (t: TareaDeAgenda) => {
    setHechas((h) => new Set(h).add(t.id))
    const r = await completarTarea(t.id) // emite `tareas:cambio`: la lista se vuelve a pedir
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

  const deActual = agenda?.de ?? de ?? 'mias'
  const conPersona = deActual !== 'mias'
  const personas = agenda?.personas ?? null
  const totalTipo = agenda ? Object.values(agenda.porTipo).reduce((a, b) => a + (b ?? 0), 0) : 0
  const sinFecha = agenda ? [...agenda.sinFecha.items, ...sinFechaExtra] : []
  const quedan = agenda ? Math.max(0, agenda.sinFecha.total - sinFecha.length) : 0
  const conFecha = agenda ? agenda.cantidades.vencidas + agenda.cantidades.hoy + agenda.cantidades.proximas : 0

  const fila = (t: TareaDeAgenda) => (
    <Fila key={t.id} t={t} conPersona={conPersona} hecha={hechas.has(t.id)} onCompletar={() => void completar(t)} onPosponer={() => posponer(t)} />
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="display text-3xl md:text-4xl">{tituloDe(deActual, personas)}</h1>
          <p aria-live="polite" className="text-sm text-texto-suave" data-resumen>
            {agenda ? agenda.resumen : ' '}
          </p>
        </div>
        <button type="button" onClick={() => setNueva(true)} className={cn(BOTON, ALTO_CONTROL, 'bg-brand px-4 text-brand-foreground hover:bg-brand/90')}>
          <Plus aria-hidden className="size-4" /> Nueva tarea
        </button>
      </div>

      {/* Filtros: selectores en el celular, botones desde 768 px (maqueta). */}
      {agenda && (
        <>
          <div className="flex gap-2 md:hidden" data-filtros-celular>
            <select
              aria-label="Filtrar por tipo de tarea"
              className={cn('min-w-0 flex-1 rounded-md border border-border bg-card px-3', ALTO_CONTROL, LETRA_CAMPO)}
              value={tipo ?? ''}
              onChange={(e) => setTipo((e.target.value || null) as TipoTarea | null)}
            >
              <option value="">Todos los tipos</option>
              {TIPOS_TAREA.filter((k) => agenda.porTipo[k]).map((k) => (
                <option key={k} value={k}>
                  {NOMBRE_TIPO[k]}
                </option>
              ))}
            </select>
            {personas && (
              <select
                aria-label="Ver las tareas de"
                className={cn('min-w-0 flex-1 rounded-md border border-border bg-card px-3', ALTO_CONTROL, LETRA_CAMPO)}
                value={deActual}
                onChange={(e) => setDe(e.target.value)}
              >
                <option value="mias">Mías</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                <option value="todos">Todo el equipo</option>
              </select>
            )}
          </div>
          <div className="hidden flex-col gap-3 md:flex" data-filtros-compu>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo">
              <span className="eyebrow mr-1">Tipo</span>
              <button type="button" className={CHIP} aria-pressed={tipo === null} onClick={() => setTipo(null)}>
                Todas <span className="text-texto-suave">{totalTipo}</span>
              </button>
              {TIPOS_TAREA.filter((k) => agenda.porTipo[k]).map((k) => {
                const Icono = ICONO_TIPO[k]
                return (
                  <button key={k} type="button" className={CHIP} aria-pressed={tipo === k} onClick={() => setTipo(k)}>
                    <Icono aria-hidden className="size-4" /> {NOMBRE_TIPO[k]} <span className="text-texto-suave">{agenda.porTipo[k]}</span>
                  </button>
                )
              })}
            </div>
            {personas && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="De quién">
                <span className="eyebrow mr-1">De quién</span>
                {[{ id: 'mias', nombre: 'Mías' }, ...personas, { id: 'todos', nombre: 'Todo el equipo' }].map((p) => (
                  <button key={p.id} type="button" className={CHIP} aria-pressed={deActual === p.id} onClick={() => setDe(p.id)}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {estado === 'error' && !agenda && (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-10 text-center">
          <TriangleAlert aria-hidden className="size-6 text-destructive-texto" />
          <p className="font-semibold">No se pudieron traer las tareas</p>
          <button type="button" onClick={() => void cargar()} className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card px-4 hover:bg-accent')}>
            <RefreshCw aria-hidden className="size-4" /> Reintentar
          </button>
        </div>
      )}
      {estado === 'cargando' && !agenda && <p className="text-sm text-texto-suave">Cargando…</p>}

      {agenda && (
        <>
          {GRUPOS.map(({ clave, titulo, Icono, tono }) =>
            agenda.grupos[clave].length > 0 ? (
              <section key={clave} className="rounded-lg border border-border bg-card px-4 py-2" data-grupo={clave}>
                <h2 className={cn('flex items-center gap-1.5 pt-2 text-sm font-semibold', tono)}>
                  <Icono aria-hidden className="size-4" /> {titulo} · {agenda.grupos[clave].length}
                </h2>
                <ul className="flex flex-col divide-y divide-border">{agenda.grupos[clave].map(fila)}</ul>
              </section>
            ) : null,
          )}

          {conFecha === 0 && agenda.sinFecha.total === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-10 text-center">
              {tipo ? (
                <>
                  <p className="font-semibold">No hay tareas de este tipo</p>
                  <p className="text-sm text-texto-suave">Probá con otro tipo o mirá todas.</p>
                  <button type="button" onClick={() => setTipo(null)} className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card px-4 hover:bg-accent')}>
                    Ver todas
                  </button>
                </>
              ) : (
                <>
                  <p className="font-semibold">Estás al día</p>
                  <p className="text-sm text-texto-suave">No hay tareas pendientes.</p>
                  <button type="button" onClick={() => setNueva(true)} className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card px-4 hover:bg-accent')}>
                    <Plus aria-hidden className="size-4" /> Nueva tarea
                  </button>
                </>
              )}
            </div>
          )}
          {conFecha === 0 && agenda.sinFecha.total > 0 && (
            <div className="rounded-lg border border-border bg-card px-4 py-6 text-center">
              <p className="font-semibold">Nada con fecha</p>
              <p className="text-sm text-texto-suave">No hay tareas vencidas, para hoy ni próximas. Las que quedan no tienen fecha.</p>
            </div>
          )}

          {agenda.sinFecha.total > 0 && (
            <details className="group rounded-lg border border-border bg-card px-4 py-2" data-grupo="sin_fecha">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Sin fecha · {agenda.sinFecha.total}</summary>
              <p className="pb-2 text-xs text-texto-suave">
                Nunca tuvieron fecha, así que no avisan en la campanita. Poneles fecha a las que sigan valiendo y completá las que no.
              </p>
              <ul className="flex flex-col divide-y divide-border">{sinFecha.map(fila)}</ul>
              {quedan > 0 && (
                <button
                  type="button"
                  onClick={() => void mas()}
                  disabled={cargandoMas}
                  className={cn(BOTON, ALTO_CONTROL, 'my-2 w-full border border-border bg-card hover:bg-accent')}
                >
                  {cargandoMas ? 'Cargando…' : `Mostrar 25 más · quedan ${quedan}`}
                </button>
              )}
            </details>
          )}
        </>
      )}

      <HojaPosponer tarea={posponiendo} onCerrar={() => setPosponiendo(null)} onHecho={() => void cargar()} />
      <NuevaTarea abierta={nueva} onAbierta={setNueva} onCreada={() => void cargar()} />
    </div>
  )
}
