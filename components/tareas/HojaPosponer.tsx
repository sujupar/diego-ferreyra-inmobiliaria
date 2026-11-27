'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Clock, Sunrise } from 'lucide-react'
import { diaCorto, textoVencimiento } from '@/lib/crm/formato-fecha'
import { enArgentina } from '@/lib/crm/horario-laboral'
import { enUnaHora, mananaALas9, validarMomento } from '@/lib/tareas/agenda'
import { cn } from '@/lib/utils'
import { OpcionGrande } from '@/components/crm/ui/OpcionGrande'
import { ALTO_CONTROL, LETRA_CAMPO } from '@/components/crm/ui/medidas'
import { deshacerPosponer, posponerTareaPedida, type FechaDeTarea } from './acciones'
import { HojaODialogo } from './HojaODialogo'

// "Posponer" / "Poner fecha" (maqueta tareas.html:118-159): tres opciones de un toque y
// "Elegir día y hora". La usan Pendientes y la campanita. Al guardar, el aviso ofrece
// "Deshacer", que vuelve a la fecha anterior (también vencida o vacía).

export interface TareaAPosponer {
  id: string
  title: string
  due_date: string | null
  due_time: string | null
  vencimiento: string
}

/** "hoy 11:45" / "mañana 9:00" / "jue 26 nov, 9:00": el texto de vencimiento, en minúscula si empieza con Hoy o Mañana. */
export function cuandoQueda(fecha: string, hora: string, ahora: Date): string {
  const t = textoVencimiento({ due_date: fecha, due_time: hora }, ahora).texto
  return /^(Hoy|Mañana)/.test(t) ? t[0].toLowerCase() + t.slice(1) : t
}

const BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'

export function HojaPosponer({
  tarea,
  onCerrar,
  onHecho,
  reloj = () => new Date(),
}: {
  tarea: TareaAPosponer | null
  onCerrar: () => void
  /** Después de guardar o de deshacer: quien la abrió vuelve a pedir lo que muestra. */
  onHecho: () => void
  reloj?: () => Date
}) {
  const [eligiendo, setEligiendo] = useState(false)
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('09:00')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const ahora = reloj()
  const sinFecha = !tarea?.due_date
  const unaHora = enUnaHora(ahora)
  const manana = mananaALas9(ahora)

  const cerrar = () => {
    setEligiendo(false)
    setError(null)
    onCerrar()
  }

  const guardar = async (fecha: string, h: string) => {
    if (!tarea || guardando) return
    const problema = validarMomento(fecha, h, reloj())
    if (problema) return setError(problema)
    setGuardando(true)
    setError(null)
    const r = await posponerTareaPedida(tarea.id, fecha, h)
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    const anterior: FechaDeTarea = r.data.anterior
    const id = tarea.id
    cerrar()
    onHecho()
    toast(`${sinFecha ? 'Queda para' : 'Pospuesta para'} ${cuandoQueda(fecha, h, reloj())}`, {
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const d = await deshacerPosponer(id, anterior, { fecha, hora: h })
          if (d.ok) toast('Listo, se deshizo.')
          else toast.error(d.error)
          onHecho()
        },
      },
    })
  }

  const abrirElegir = () => {
    setDia(manana.fecha)
    setHora('09:00')
    setError(null)
    setEligiendo(true)
  }

  return (
    <HojaODialogo
      abierta={tarea !== null}
      onAbierta={(a) => !a && cerrar()}
      titulo={sinFecha ? 'Poner fecha' : 'Posponer'}
      descripcion={tarea ? `${tarea.title} · ${tarea.vencimiento}` : ''}
      pie={
        eligiendo ? (
          <>
            <button type="button" className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent')} onClick={cerrar}>
              Cancelar
            </button>
            <button
              type="button"
              className={cn(BOTON, ALTO_CONTROL, 'bg-brand text-brand-foreground hover:bg-brand/90')}
              disabled={guardando}
              onClick={() => void guardar(dia, hora)}
            >
              ✓ Guardar
            </button>
          </>
        ) : undefined
      }
    >
      {tarea && (
        <p className="text-sm text-texto-suave" data-subtitulo>
          <strong className="font-semibold text-foreground">{tarea.title}</strong> · {tarea.vencimiento}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <OpcionGrande Icono={Clock} disabled={guardando} onClick={() => void guardar(unaHora.fecha, unaHora.hora)} extra={<span className="text-xs text-texto-suave">{cuandoQueda(unaHora.fecha, unaHora.hora, ahora)}</span>}>
          En 1 hora
        </OpcionGrande>
        <OpcionGrande Icono={Sunrise} disabled={guardando} onClick={() => void guardar(manana.fecha, manana.hora)} extra={<span className="text-xs text-texto-suave">{diaCorto(manana.fecha)}</span>}>
          Mañana a las 9:00
        </OpcionGrande>
        <OpcionGrande Icono={CalendarClock} presionada={eligiendo} disabled={guardando} onClick={abrirElegir} extra={<span className="text-xs text-texto-suave">Vos decidís cuándo</span>}>
          Elegir día y hora
        </OpcionGrande>
      </div>
      {eligiendo && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Día
            <input
              type="date"
              className={cn('rounded-md border border-border bg-card px-3', ALTO_CONTROL, LETRA_CAMPO)}
              min={enArgentina(ahora).fecha}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Hora
            <input
              type="time"
              step={300}
              className={cn('rounded-md border border-border bg-card px-3', ALTO_CONTROL, LETRA_CAMPO)}
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-texto">
          {error}
        </p>
      )}
    </HojaODialogo>
  )
}
