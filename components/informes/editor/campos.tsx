'use client'
/**
 * Campos del editor del informe. Guardan al SALIR del campo, nunca por tecla ni por temporizador
 * (CLAUDE.md § "Modificar ficha": un guardado a mitad de escritura deja un número a medias).
 */
import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { numeroDelCampo } from '@/lib/informes/editor'
import { cn } from '@/lib/utils'

const miles = new Intl.NumberFormat('es-AR')

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

export function CampoNumero({ id, etiqueta, valor, onGuardar, deshabilitado, falta, sufijo }: {
  id: string
  etiqueta: string
  valor: number | undefined | null
  onGuardar: (n: number | undefined) => void
  deshabilitado?: boolean
  /** Lo marca en naranja: es un dato que el informe necesita para quedar listo. */
  falta?: boolean
  sufijo?: string
}) {
  const [texto, setTexto] = useState(typeof valor === 'number' ? miles.format(valor) : '')
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
          }}
          onBlur={() => {
            const n = numeroDelCampo(texto)
            if (n !== (valor ?? undefined)) onGuardar(n)
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        {sufijo ? <span className="text-sm text-muted-foreground">{sufijo}</span> : null}
      </div>
    </div>
  )
}

export function CampoLinea({ id, etiqueta, valor, onGuardar, deshabilitado, ayuda, placeholder, maxLength }: {
  id: string
  etiqueta: string
  valor: string | undefined | null
  onGuardar: (t: string) => void
  deshabilitado?: boolean
  ayuda?: string
  placeholder?: string
  /** El mismo tope que valida el servidor: lo que no entra, no se puede escribir. */
  maxLength?: number
}) {
  const [texto, setTexto] = useState(valor ?? '')
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
        onChange={e => setTexto(e.target.value)}
        onBlur={() => { if (texto.trim() !== (valor ?? '').trim()) onGuardar(texto.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  )
}

export function CampoTexto({ id, etiqueta, valor, onGuardar, deshabilitado, falta, ayuda, filas = 4 }: {
  id: string
  etiqueta: string
  valor: string | undefined
  onGuardar: (t: string) => void
  deshabilitado?: boolean
  falta?: boolean
  ayuda?: string
  filas?: number
}) {
  const [texto, setTexto] = useState(valor ?? '')
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={cn(falta && 'text-orange-700')}>{etiqueta}{falta ? ' (falta)' : ''}</Label>
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
      <Textarea
        id={id}
        rows={filas}
        value={texto}
        disabled={deshabilitado}
        className={cn(falta && 'border-orange-400')}
        onChange={e => setTexto(e.target.value)}
        onBlur={() => { if (texto.trim() !== (valor ?? '').trim()) onGuardar(texto.trim()) }}
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
