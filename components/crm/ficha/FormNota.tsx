'use client'

import { useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { MAX_LARGO_TEXTO } from '@/lib/crm/actividades'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL, LETRA_CAMPO } from '../ui/medidas'
import { guardarActividad, nuevoToken, type RespuestaGuardado } from './guardar-actividad'

// Nota rápida (maqueta `plantillaNota`). Vacía o con más de 2.000 caracteres no se guarda
// y lo escrito no se pierde; ante un error del servidor tampoco.
export function FormNota({
  contactoId,
  onGuardada,
  refCampo,
}: {
  contactoId: string
  onGuardada: (r: RespuestaGuardado) => void
  refCampo?: React.Ref<HTMLTextAreaElement>
}) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const token = useRef(nuevoToken())
  const enCurso = useRef(false)

  const guardar = async () => {
    if (enCurso.current) return
    const limpio = texto.normalize('NFC').trim()
    if (!limpio) return setError('Escribí algo para guardar la nota')
    if (limpio.length > MAX_LARGO_TEXTO) {
      return setError(`El texto no puede pasar de ${MAX_LARGO_TEXTO.toLocaleString('es-AR')} caracteres.`)
    }
    enCurso.current = true
    setEnviando(true)
    setError(null)
    const r = await guardarActividad(contactoId, { kind: 'note', body: limpio, client_token: token.current })
    enCurso.current = false
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    token.current = nuevoToken()
    setTexto('')
    onGuardada(r.data)
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-form="nota">
      <textarea
        ref={refCampo}
        aria-label="Nota"
        rows={3}
        value={texto}
        aria-invalid={!!error}
        onChange={(e) => {
          setTexto(e.target.value)
          if (error) setError(null)
        }}
        placeholder="Escribí una nota…"
        className={cn(
          'min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 leading-snug placeholder:text-muted-foreground aria-invalid:border-destructive',
          LETRA_CAMPO,
        )}
      />
      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-destructive-texto">
          <TriangleAlert aria-hidden className="size-3.5" />
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={enviando}
          className={cn(
            'inline-flex items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60',
            ALTO_CONTROL,
          )}
        >
          Guardar nota
        </button>
      </div>
    </div>
  )
}
