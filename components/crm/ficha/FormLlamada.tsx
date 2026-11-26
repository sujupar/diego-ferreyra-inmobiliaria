'use client'

import { useRef, useState } from 'react'
import { Clock, MessageCircle, TriangleAlert } from 'lucide-react'
import { MAX_LARGO_TEXTO } from '@/lib/crm/actividades'
import { enArgentina, instanteDesdeAR } from '@/lib/crm/horario-laboral'
import type { ResultadoLlamada } from '@/lib/crm/tipos'
import { cn } from '@/lib/utils'
import { FiltroPastilla } from '../ui/FiltroPastilla'
import { OpcionGrande } from '../ui/OpcionGrande'
import { ALTO_CONTROL, LETRA_CAMPO } from '../ui/medidas'
import { ORDEN_RESULTADOS, RESULTADOS_UI } from '../ui/resultados'
import { guardarActividad, nuevoToken, type RespuestaGuardado } from './guardar-actividad'

// Registrar una llamada (maqueta `plantillaLlamada`): cinco resultados, "No atendió" se
// guarda con un toque; "volver a llamar" pide día y hora futuros; comentario opcional;
// "Corregir la hora" hacia atrás; y "Marcar WhatsApp enviado", que guarda la marca con el
// comentario y la hora corregida elegidos (no el resultado ni el día de volver a llamar).
//
// `client_token` (D5): nace al montar o limpiar el formulario y se renueva SOLO después de
// un guardado exitoso. Un doble toque o un reintento tras un error mandan el mismo: si
// naciera en el toque, un doble toque en "No atendió" serían dos llamadas.

type Atraso = '0' | '15' | '30' | '60'
const ATRASOS: { valor: Atraso; etiqueta: string }[] = [
  { valor: '0', etiqueta: 'Recién' },
  { valor: '15', etiqueta: 'Hace 15 min' },
  { valor: '30', etiqueta: 'Hace 30 min' },
  { valor: '60', etiqueta: 'Hace 1 hora' },
]

type Atajo = 'hoy16' | 'manana10' | 'manana16'
const ATAJOS: { valor: Atajo; etiqueta: string; dias: number; hora: string }[] = [
  { valor: 'hoy16', etiqueta: 'Hoy 16:00', dias: 0, hora: '16:00' },
  { valor: 'manana10', etiqueta: 'Mañana 10:00', dias: 1, hora: '10:00' },
  { valor: 'manana16', etiqueta: 'Mañana 16:00', dias: 1, hora: '16:00' },
]

/** Fecha de Argentina de hoy + N días de calendario. */
function fechaAR(ahora: Date, dias: number): string {
  const hoy = enArgentina(ahora).fecha
  if (dias === 0) return hoy
  return enArgentina(new Date(instanteDesdeAR(hoy, '12:00').getTime() + dias * 86_400_000)).fecha
}

export type TipoGuardado = 'call' | 'whatsapp_sent'

export function FormLlamada({
  contactoId,
  onGuardado,
  refNoAtendio,
  enHoja = false,
  reloj = () => new Date(),
}: {
  contactoId: string
  onGuardado: (r: RespuestaGuardado, tipo: TipoGuardado) => void
  refNoAtendio?: React.Ref<HTMLButtonElement>
  /** En la hoja del celular "Guardar llamada" va pegado al pie y el cuerpo se acomoda. */
  enHoja?: boolean
  reloj?: () => Date
}) {
  const [resultado, setResultado] = useState<ResultadoLlamada | null>(null)
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('')
  const [atajo, setAtajo] = useState<Atajo | null>(null)
  const [errorVolver, setErrorVolver] = useState<string | null>(null)
  const [invalidos, setInvalidos] = useState<{ dia: boolean; hora: boolean }>({ dia: false, hora: false })
  const [comentario, setComentario] = useState('')
  const [horaAbierta, setHoraAbierta] = useState(false)
  const [atraso, setAtraso] = useState<Atraso>('0')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenLlamada = useRef(nuevoToken())
  const tokenWhatsapp = useRef(nuevoToken())
  const enCurso = useRef(false)
  const refGuardar = useRef<HTMLButtonElement>(null)
  const refVolver = useRef<HTMLDivElement>(null)

  const limpiar = () => {
    setResultado(null)
    setDia('')
    setHora('')
    setAtajo(null)
    setErrorVolver(null)
    setInvalidos({ dia: false, hora: false })
    setComentario('')
    setHoraAbierta(false)
    setAtraso('0')
    setError(null)
    tokenLlamada.current = nuevoToken()
    tokenWhatsapp.current = nuevoToken()
  }

  /** "Guardar llamada" entero a la vista (D5: en escritorio la página se acomoda). */
  const mostrarGuardar = () => {
    requestAnimationFrame(() => {
      const g = refGuardar.current
      if (!g) return
      if (!enHoja) {
        g.scrollIntoView?.({ block: 'nearest' })
        return
      }
      // En la hoja "Guardar llamada" va pegado abajo y tapa lo que queda detrás: se
      // desplaza el cuerpo lo justo para que Día y Hora se vean enteros (D6).
      const bloque = refVolver.current
      const cuerpo = g.closest<HTMLElement>('[data-hoja-cuerpo]')
      if (!bloque || !cuerpo) return
      const falta = bloque.getBoundingClientRect().bottom + 12 - g.getBoundingClientRect().top
      if (falta > 0) cuerpo.scrollTop += falta
    })
  }

  const enviar = async (cuerpo: Parameters<typeof guardarActividad>[1], tipo: TipoGuardado) => {
    if (enCurso.current) return
    enCurso.current = true
    setEnviando(true)
    setError(null)
    const r = await guardarActividad(contactoId, cuerpo)
    enCurso.current = false
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    limpiar()
    onGuardado(r.data, tipo)
  }

  const comunes = () => {
    const body = comentario.normalize('NFC').trim()
    const minutos = Number(atraso)
    return { ...(body ? { body } : {}), ...(minutos > 0 ? { hace_minutos: minutos } : {}) }
  }

  const comentarioLargo = comentario.normalize('NFC').trim().length > MAX_LARGO_TEXTO

  const guardarLlamada = (r: ResultadoLlamada) => {
    if (comentarioLargo) {
      setError(`El texto no puede pasar de ${MAX_LARGO_TEXTO.toLocaleString('es-AR')} caracteres.`)
      return
    }
    let volver_el: { fecha: string; hora: string } | undefined
    if (r === 'volver_a_llamar') {
      let msj: string | null = null
      let ahoraEsPasado = false
      if (!dia || !hora) msj = 'Elegí día y hora para volver a llamar'
      else {
        try {
          ahoraEsPasado = instanteDesdeAR(dia, hora).getTime() <= reloj().getTime()
        } catch {
          ahoraEsPasado = true
        }
        if (ahoraEsPasado) msj = 'Tiene que ser más adelante que ahora'
      }
      if (msj) {
        setErrorVolver(msj)
        setInvalidos({ dia: !dia || ahoraEsPasado, hora: !hora || ahoraEsPasado })
        return
      }
      volver_el = { fecha: dia, hora }
    }
    void enviar(
      {
        kind: 'call',
        call_outcome: r,
        client_token: tokenLlamada.current,
        ...comunes(),
        ...(volver_el ? { volver_el } : {}),
      },
      'call',
    )
  }

  const elegir = (r: ResultadoLlamada) => {
    if (enviando) return
    if (r === 'no_atendio') {
      // Un toque y queda guardada (spec: tres toques desde la ficha en celular).
      setResultado(null)
      guardarLlamada('no_atendio')
      return
    }
    setResultado(r)
    if (r !== 'volver_a_llamar') {
      setErrorVolver(null)
      requestAnimationFrame(() => refGuardar.current?.focus({ preventScroll: true }))
    }
    mostrarGuardar()
  }

  const elegirAtajo = (a: Atajo) => {
    const def = ATAJOS.find((x) => x.valor === a)
    if (!def) return
    setAtajo(a)
    setDia(fechaAR(reloj(), def.dias))
    setHora(def.hora)
    // Ya son válidos: fuera el rojo y el mensaje, sin esperar otro "Guardar".
    setErrorVolver(null)
    setInvalidos({ dia: false, hora: false })
    refGuardar.current?.focus({ preventScroll: true })
    mostrarGuardar()
  }

  const cambiarDia = (v: string) => {
    setDia(v)
    setAtajo(null)
    setInvalidos((i) => ({ dia: v ? false : i.dia, hora: v && hora ? false : i.hora }))
    if (v && hora) setErrorVolver(null)
  }
  const cambiarHora = (v: string) => {
    setHora(v)
    setAtajo(null)
    setInvalidos((i) => ({ hora: v ? false : i.hora, dia: v && dia ? false : i.dia }))
    if (v && dia) setErrorVolver(null)
  }

  const marcarWhatsapp = () => {
    if (comentarioLargo) {
      setError(`El texto no puede pasar de ${MAX_LARGO_TEXTO.toLocaleString('es-AR')} caracteres.`)
      return
    }
    void enviar({ kind: 'whatsapp_sent', client_token: tokenWhatsapp.current, ...comunes() }, 'whatsapp_sent')
  }

  const campo = cn('w-full rounded-md border border-input bg-card px-3 aria-invalid:border-destructive', LETRA_CAMPO, ALTO_CONTROL)
  const hoy = enArgentina(reloj()).fecha

  return (
    <div className="flex min-w-0 flex-col gap-3 [container-type:inline-size]" data-form="llamada">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-[0.14em] text-muted-foreground">¿Qué pasó?</p>
      <div className="grid grid-cols-1 gap-2 @min-[34rem]:grid-cols-2">
        {ORDEN_RESULTADOS.map((r) => {
          const def = RESULTADOS_UI[r]
          return (
            <OpcionGrande
              key={r}
              ref={r === 'no_atendio' ? refNoAtendio : undefined}
              Icono={def.Icono}
              presionada={resultado === r}
              disabled={enviando}
              onClick={() => elegir(r)}
              extra={
                r === 'no_atendio' ? (
                  <span className="ml-auto inline-flex h-6 shrink-0 items-center rounded-full border border-border px-2 text-xs font-medium text-texto-suave">
                    Guarda al toque
                  </span>
                ) : undefined
              }
            >
              {def.texto}
            </OpcionGrande>
          )
        })}
      </div>

      {resultado === 'volver_a_llamar' && (
        <div ref={refVolver} className="flex flex-col gap-2.5 rounded-lg bg-brand-soft p-3" data-bloque="volver">
          <p className="text-[13px] font-semibold text-brand">¿Cuándo hay que volver a llamar?</p>
          <FiltroPastilla etiqueta="Atajos de día y hora" opciones={ATAJOS} valor={atajo} onCambiar={elegirAtajo} />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-brand">Día</span>
              <input
                type="date"
                min={hoy}
                value={dia}
                aria-invalid={invalidos.dia}
                onChange={(e) => cambiarDia(e.target.value)}
                className={campo}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-brand">Hora</span>
              <input
                type="time"
                value={hora}
                aria-invalid={invalidos.hora}
                onChange={(e) => cambiarHora(e.target.value)}
                className={campo}
              />
            </label>
          </div>
          {errorVolver && (
            <p role="alert" className="flex items-center gap-1 text-xs text-destructive-texto">
              <TriangleAlert aria-hidden className="size-3.5" />
              {errorVolver}
            </p>
          )}
        </div>
      )}

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13px] font-medium">
          Comentario <span className="text-texto-suave">(opcional)</span>
        </span>
        <textarea
          rows={2}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej.: pidió que la llamen a la tarde"
          className={cn('min-h-15 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 leading-snug', LETRA_CAMPO)}
        />
      </label>

      <div className="-mt-1.5 flex flex-col gap-1.5">
        <button
          type="button"
          aria-expanded={horaAbierta}
          onClick={() => {
            const abre = !horaAbierta
            setHoraAbierta(abre)
            if (abre && resultado && !enHoja) mostrarGuardar()
          }}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] text-texto-suave underline decoration-border underline-offset-[3px] hover:text-foreground raton:min-h-7"
        >
          <Clock aria-hidden className="size-4" />
          ¿Fue hace un rato? Corregir la hora
        </button>
        {horaAbierta && (
          <FiltroPastilla etiqueta="Cuándo fue la llamada" opciones={ATRASOS} valor={atraso} onCambiar={setAtraso} />
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive-texto">
          <TriangleAlert aria-hidden className="size-3.5" />
          {error}
        </p>
      )}

      {resultado && (
        <button
          ref={refGuardar}
          type="button"
          disabled={enviando}
          onClick={() => guardarLlamada(resultado)}
          data-guardar-llamada
          className={cn(
            'inline-flex w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60 [scroll-margin-bottom:1rem]',
            ALTO_CONTROL,
            enHoja ? 'sticky bottom-0 z-[1] shrink-0 shadow-[0_0_0_0.75rem_var(--background),0_-1.25rem_1rem_-0.25rem_var(--background)]' : 'raton:w-auto raton:self-start',
          )}
        >
          Guardar llamada
        </button>
      )}

      <hr className="h-px border-0 bg-border" />
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={enviando}
          onClick={marcarWhatsapp}
          className={cn(
            'inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent disabled:opacity-60',
            ALTO_CONTROL,
            !enHoja && 'raton:w-auto raton:self-start',
          )}
        >
          <MessageCircle aria-hidden className="size-4" />
          Marcar WhatsApp enviado
        </button>
        <p className="text-xs text-texto-suave">No manda nada: deja anotado que le escribiste desde tu teléfono.</p>
      </div>
    </div>
  )
}
