'use client'
/**
 * Campos del editor del informe. Guardan al SALIR del campo (o Enter) y, con `alTipear`, también a los 1,5 s de
 * dejar de escribir: el informe es un BORRADOR interno, así que un guardado a mitad de frase no se ve en ningún
 * lado público (la regla "nunca por temporizador" de CLAUDE.md § "Modificar ficha" es por la landing, que lee el
 * precio en vivo). Lo que todavía no se mandó se le avisa al editor (`onPendiente`) para mandarlo si se cierra
 * la pestaña, y se manda al desmontar el campo.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ESPERA_AL_TIPEAR_MS } from '@/lib/informes/autoguardado'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { numeroDelCampo } from '@/lib/informes/editor'
import { cn } from '@/lib/utils'

const miles = new Intl.NumberFormat('es-AR')

/** Avisa al editor qué campo tiene algo sin mandar; `enviar` lo manda ya (se usa al cerrar la pestaña). */
export type AvisarPendiente = (id: string, enviar: (() => void) | null) => void

interface OpcionesGuardado<T> {
  id: string
  valor: T
  onGuardar: (v: T) => void
  igual: (a: T, b: T) => boolean
  alTipear?: boolean
  onPendiente?: AvisarPendiente
}

/**
 * Guardado de UN campo. `onGuardar`, `valor` y `onPendiente` van en refs: el editor los arma en cada render y un
 * temporizador con la versión vieja mandaría un dato viejo.
 */
function useGuardadoDelCampo<T>(o: OpcionesGuardado<T>) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actual = useRef<T>(o.valor)
  const sucio = useRef(false)
  // Lo último que se MANDÓ (no lo último que llegó de la base): después de un guardado por pausa, la base tarda
  // en devolver el valor nuevo; comparar contra `valor` saltearía volver al texto de antes ("AB" → "A").
  const enviado = useRef<T>(o.valor)
  const props = useRef(o)
  useEffect(() => { props.current = o })
  // Un cambio que viene de afuera (otra persona, la plataforma reescribió) pasa a ser la referencia.
  useEffect(() => { if (!sucio.current) enviado.current = o.valor }, [o.valor])

  const guardar = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!sucio.current) return
    sucio.current = false
    const { id, onGuardar, igual, onPendiente } = props.current
    onPendiente?.(id, null)
    if (igual(actual.current, enviado.current)) return
    enviado.current = actual.current
    onGuardar(actual.current)
  }, [])

  const cambio = useCallback((v: T) => {
    actual.current = v
    sucio.current = true
    const { id, alTipear, onPendiente } = props.current
    onPendiente?.(id, guardar)
    if (!alTipear) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(guardar, ESPERA_AL_TIPEAR_MS)
  }, [guardar])

  // Salir de la pantalla (otra página de la app) sin salir del campo: lo pendiente se manda igual.
  useEffect(() => () => guardar(), [guardar])

  return { cambio, guardar }
}

const mismoNumero = (a: number | undefined, b: number | undefined) => a === b
const mismoTexto = (a: string, b: string) => a.trim() === b.trim()

export function Seccion({ titulo, ayuda, children, id }: { titulo: string; ayuda?: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h2 id={id} className="text-base font-semibold">{titulo}</h2>
        {ayuda ? <p className="mt-1 text-sm text-muted-foreground">{ayuda}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function CampoNumero({ id, etiqueta, valor, onGuardar, deshabilitado, falta, sufijo, alTipear, onPendiente }: {
  id: string
  etiqueta: string
  valor: number | undefined | null
  onGuardar: (n: number | undefined) => void
  deshabilitado?: boolean
  /** Lo marca en naranja: es un dato que el informe necesita para quedar listo. */
  falta?: boolean
  sufijo?: string
  alTipear?: boolean
  onPendiente?: AvisarPendiente
}) {
  const [texto, setTexto] = useState(typeof valor === 'number' ? miles.format(valor) : '')
  const g = useGuardadoDelCampo<number | undefined>({ id, valor: valor ?? undefined, onGuardar, igual: mismoNumero, alTipear, onPendiente })
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={cn(falta && 'text-orange-700')}>{etiqueta}{falta ? ' (falta)' : ''}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          value={texto}
          disabled={deshabilitado}
          className={cn('h-11', falta && 'border-orange-400')}
          onChange={e => {
            // Se muestra agrupado mientras se escribe: "930" y "9.300" no se confunden.
            const n = numeroDelCampo(e.target.value)
            setTexto(n === undefined ? '' : miles.format(n))
            g.cambio(n)
          }}
          onBlur={g.guardar}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        {sufijo ? <span className="text-sm text-muted-foreground">{sufijo}</span> : null}
      </div>
    </div>
  )
}

export function CampoLinea({ id, etiqueta, valor, onGuardar, deshabilitado, ayuda, placeholder, maxLength, alTipear, onPendiente }: {
  id: string
  etiqueta: string
  valor: string | undefined | null
  onGuardar: (t: string) => void
  deshabilitado?: boolean
  ayuda?: string
  placeholder?: string
  /** El mismo tope que valida el servidor: lo que no entra, no se puede escribir. */
  maxLength?: number
  alTipear?: boolean
  onPendiente?: AvisarPendiente
}) {
  const [texto, setTexto] = useState(valor ?? '')
  const g = useGuardadoDelCampo<string>({ id, valor: valor ?? '', onGuardar: t => onGuardar(t.trim()), igual: mismoTexto, alTipear, onPendiente })
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        value={texto}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={deshabilitado}
        className="h-11"
        onChange={e => { setTexto(e.target.value); g.cambio(e.target.value) }}
        onBlur={g.guardar}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  )
}

export function CampoTexto({ id, etiqueta, valor, onGuardar, deshabilitado, falta, ayuda, filas = 4, revisar, alTipear, onPendiente }: {
  id: string
  etiqueta: string
  valor: string | undefined
  onGuardar: (t: string) => void
  deshabilitado?: boolean
  falta?: boolean
  ayuda?: string
  filas?: number
  /** La plataforma escribió un número que no está en los datos del informe: hay que mirarlo. */
  revisar?: boolean
  alTipear?: boolean
  onPendiente?: AvisarPendiente
}) {
  const [texto, setTexto] = useState(valor ?? '')
  const g = useGuardadoDelCampo<string>({ id, valor: valor ?? '', onGuardar: t => onGuardar(t.trim()), igual: mismoTexto, alTipear, onPendiente })
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={cn(falta && 'text-orange-700')}>{etiqueta}{falta ? ' (falta)' : ''}</Label>
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
      {revisar ? <p className="text-xs text-orange-700">Tiene un número que no encontré en los datos del informe: revisalo antes de marcar listo.</p> : null}
      <Textarea
        id={id}
        rows={filas}
        value={texto}
        disabled={deshabilitado}
        className={cn(falta && 'border-orange-400')}
        onChange={e => { setTexto(e.target.value); g.cambio(e.target.value) }}
        onBlur={g.guardar}
      />
    </div>
  )
}

/** "Está publicada en Zonaprop": sin marcar, ese portal no sale en el informe y no cuenta como faltante. */
export function Publicada({ id, portal, publicado, onCambiar, deshabilitado }: {
  id: string; portal: string; publicado: boolean | undefined; onCambiar: (v: boolean) => void; deshabilitado?: boolean
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" className="h-4 w-4" checked={publicado !== false} disabled={deshabilitado} onChange={e => onCambiar(e.target.checked)} />
      Está publicada en {portal}
    </label>
  )
}
