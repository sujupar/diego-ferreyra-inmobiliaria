'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, ListChecks, MapPin, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import { diaCorto, horaCorta } from '@/lib/crm/formato-fecha'
import { enArgentina } from '@/lib/crm/horario-laboral'
import { CANAL_DE_TIPO, grupoDeTarea, NOMBRE_TIPO, TIPOS_TAREA, validarMomento, type TipoTarea } from '@/lib/tareas/agenda'
import { MAX_TITULO } from '@/lib/tasks/validate-task-input'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL, LETRA_CAMPO } from '@/components/crm/ui/medidas'
import { crearTarea } from './acciones'
import { HojaODialogo } from './HojaODialogo'

// "Nueva tarea" (maqueta tareas.html:56-116): un solo formulario para Pendientes, la ficha y
// las pantallas de proceso, propiedad y tasación (spec "Un solo formulario de nueva tarea").
// Fechas en hora de Argentina; sin día queda en "Sin fecha".

export const ICONO_TIPO: Record<TipoTarea, LucideIcon> = {
  llamada: Phone,
  mensaje: MessageCircle,
  visita: MapPin,
  documentacion: FileText,
  otro: ListChecks,
}

export const NOMBRE_GRUPO = { vencidas: 'Vencidas', hoy: 'Hoy', proximas: 'Próximas', sin_fecha: 'Sin fecha' } as const

const ROLES_ASIGNAN = ['admin', 'dueno', 'coordinador']
const BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'
const CAMPO = cn('w-full rounded-md border border-border bg-card px-3', ALTO_CONTROL, LETRA_CAMPO)

export interface EntidadDeTarea {
  kind: 'deal' | 'property' | 'appraisal' | 'contact'
  id: string
  label?: string
}

function proximaHoraEnPunto(ahora: Date): { fecha: string; hora: string } {
  const t = new Date(Math.floor(ahora.getTime() / 3_600_000) * 3_600_000 + 3_600_000)
  const a = enArgentina(t)
  return { fecha: a.fecha, hora: a.hora.slice(0, 5) }
}

export function ayudaDeAviso(dia: string, hora: string, todoElDia: boolean): string {
  if (!dia) return 'Sin día queda en «Sin fecha» y no avisa en la campanita.'
  if (todoElDia || !hora) return `Avisa en la campanita el ${diaCorto(dia)} desde las 9:00.`
  return `Avisa en la campanita el ${diaCorto(dia)} a las ${horaCorta(hora)}.`
}

export function NuevaTarea({
  abierta,
  onAbierta,
  entidad,
  onCreada,
  reloj = () => new Date(),
}: {
  abierta: boolean
  onAbierta: (a: boolean) => void
  entidad?: EntidadDeTarea
  onCreada?: (id: string | null) => void
  reloj?: () => Date
}) {
  const refTitulo = useRef<HTMLInputElement>(null)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoTarea>('otro')
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('')
  const [todoElDia, setTodoElDia] = useState(false)
  const [asignado, setAsignado] = useState('')
  const [yo, setYo] = useState<{ id: string; role: string; nombre: string } | null>(null)
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const puedeAsignar = !!yo && ROLES_ASIGNAN.includes(yo.role)

  // Al abrir: valores de la maqueta (hoy, la próxima hora en punto) y quién mira.
  useEffect(() => {
    if (!abierta) return
    const p = proximaHoraEnPunto(reloj())
    setTitulo('')
    setTipo('otro')
    setDia(p.fecha)
    setHora(p.hora)
    setTodoElDia(false)
    setAsignado('')
    setError(null)
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j: { id?: string; role?: string; full_name?: string; profile?: { full_name?: string } }) => {
        if (j?.id && j.role) setYo({ id: j.id, role: j.role, nombre: j.full_name ?? j.profile?.full_name ?? '' })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierta])

  useEffect(() => {
    if (!abierta || !puedeAsignar) return
    fetch('/api/users/assignable')
      .then((r) => r.json())
      .then((j: { data?: { id: string; full_name: string }[] }) =>
        setPersonas((j.data ?? []).map((u) => ({ id: u.id, nombre: u.full_name })).filter((u) => u.id !== yo?.id)),
      )
      .catch(() => {})
  }, [abierta, puedeAsignar, yo?.id])

  const crear = async () => {
    const t = titulo.normalize('NFC').trim()
    if (!t) return setError('Escribí qué hay que hacer.')
    if (dia && !todoElDia && hora) {
      const problema = validarMomento(dia, hora, reloj())
      if (problema) return setError(problema)
    }
    setGuardando(true)
    setError(null)
    const conHora = !!dia && !todoElDia && !!hora
    const cuerpo: Record<string, unknown> = {
      type: 'follow_up',
      title: t,
      channel: CANAL_DE_TIPO[tipo],
      due_date: dia || null,
      all_day: !conHora,
      due_time: conHora ? hora : null,
    }
    if (entidad) cuerpo[`${entidad.kind}_id`] = entidad.id
    if (asignado) cuerpo.assigned_to = asignado
    const r = await crearTarea(cuerpo)
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    const grupo = grupoDeTarea({ due_date: dia || null, due_time: conHora ? hora : null }, reloj())
    const para = asignado ? personas.find((p) => p.id === asignado)?.nombre : null
    // Sin el enrutador de Next a propósito: este formulario se monta en pantallas (y pruebas)
    // donde no hay contexto de navegación.
    const enPendientes = typeof window !== 'undefined' && window.location.pathname.startsWith('/tasks')
    onAbierta(false)
    onCreada?.(r.data.id ?? null)
    toast(`Tarea creada${para ? ` para ${para}` : ''} · queda en «${NOMBRE_GRUPO[grupo]}»`, {
      ...(enPendientes ? {} : { action: { label: 'Ver', onClick: () => window.location.assign('/tasks') } }),
    })
  }

  const desdeFicha = entidad?.kind === 'contact'
  return (
    <HojaODialogo
      abierta={abierta}
      onAbierta={onAbierta}
      titulo="Nueva tarea"
      descripcion="Crear una tarea con día y hora para que avise en la campanita"
      alAbrir={() => refTitulo.current?.focus()}
      pie={
        <>
          <button type="button" className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent')} onClick={() => onAbierta(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className={cn(BOTON, ALTO_CONTROL, 'bg-brand text-brand-foreground hover:bg-brand/90')}
            disabled={guardando}
            onClick={() => void crear()}
          >
            {guardando ? 'Creando…' : '✓ Crear tarea'}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        ¿Qué hay que hacer?
        <input
          ref={refTitulo}
          className={CAMPO}
          maxLength={MAX_TITULO}
          value={titulo}
          placeholder={desdeFicha ? 'Ej.: Pedirle la escritura' : 'Ej.: Llamar al propietario de Yatay 540'}
          aria-invalid={error === 'Escribí qué hay que hacer.' || undefined}
          onChange={(e) => setTitulo(e.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {TIPOS_TAREA.map((k) => {
            const Icono = ICONO_TIPO[k]
            return (
              <button
                key={k}
                type="button"
                aria-pressed={tipo === k}
                onClick={() => setTipo(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm',
                  ALTO_CONTROL,
                  'aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand',
                )}
              >
                <Icono aria-hidden className="size-4" />
                {NOMBRE_TIPO[k]}
              </button>
            )
          })}
        </div>
      </fieldset>

      {entidad?.label && (
        <p className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium">{desdeFicha ? 'Contacto' : 'Para'}</span>
          <span className="text-texto-suave">{entidad.label}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Día
          <input type="date" className={CAMPO} min={enArgentina(reloj()).fecha} value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Hora (opcional)
          <input type="time" step={300} className={CAMPO} disabled={todoElDia || !dia} value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
      </div>
      <label className={cn('flex items-center gap-2 text-sm', 'min-h-11 raton:min-h-9')} data-fila-todo-el-dia>
        <input type="checkbox" className="mt-0.5 size-5" checked={todoElDia} disabled={!dia} onChange={(e) => setTodoElDia(e.target.checked)} />
        <span>
          Todo el día
          <span className="block text-xs text-texto-suave">Sin hora. Avisa desde las 9:00.</span>
        </span>
      </label>
      <p className="text-xs text-texto-suave" data-ayuda>
        {ayudaDeAviso(dia, hora, todoElDia)}
      </p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Asignada a
        {puedeAsignar ? (
          <select className={CAMPO} value={asignado} onChange={(e) => setAsignado(e.target.value)}>
            <option value="">Yo{yo?.nombre ? ` (${yo.nombre})` : ''}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-normal text-texto-suave">Vos{yo?.nombre ? ` (${yo.nombre})` : ''}</span>
        )}
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive-texto">
          {error}
        </p>
      )}
    </HojaODialogo>
  )
}
