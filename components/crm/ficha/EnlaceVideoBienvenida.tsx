'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { leerJson } from '@/lib/crm/leer-json'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL } from '../ui/medidas'
import { Tarjeta } from './Tarjeta'

// "Video de bienvenida" en la columna derecha de la ficha (tasacion-video-bienvenida, D8):
// el enlace personal para copiar, o "Crear enlace del video" para quien se registró antes del
// cambio. Crear NO manda nada: Paula se lo manda a mano. Si no hay enlace ni se puede crear, o
// si la lectura falla, la tarjeta no aparece (nada que se vea y no funcione).

interface Respuesta {
  enlace: { codigo: string; url: string } | null
  puedeCrear: boolean
}

const BOTON =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'

export function EnlaceVideoBienvenida({ contactoId }: { contactoId: string }) {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [creando, setCreando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ruta = `/api/contacts/${contactoId}/video-bienvenida`

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const r = await leerJson<Respuesta>(await fetch(ruta, { cache: 'no-store' }))
        if (vivo && r.ok) setDatos(r.data)
      } catch {
        /* sin tarjeta */
      }
    })()
    return () => {
      vivo = false
    }
  }, [ruta])

  const crear = useCallback(async () => {
    setCreando(true)
    setError(null)
    try {
      const r = await leerJson<{ enlace: Respuesta['enlace'] }>(await fetch(ruta, { method: 'POST' }))
      if (r.ok) setDatos({ enlace: r.data.enlace, puedeCrear: false })
      else setError(r.error)
    } catch {
      setError('No se pudo crear el enlace. Probá de nuevo.')
    } finally {
      setCreando(false)
    }
  }, [ruta])

  const copiar = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar. Mantené apretado el enlace para copiarlo.')
    }
  }, [])

  if (!datos || (!datos.enlace && !datos.puedeCrear)) return null

  return (
    <Tarjeta titulo="Video de bienvenida" data-video-bienvenida>
      {datos.enlace ? (
        <div className="flex min-w-0 items-center gap-2">
          <Link2 aria-hidden className="size-4 shrink-0 text-texto-suave" />
          <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{datos.enlace.url.replace(/^https:\/\//, '')}</span>
          <button
            type="button"
            onClick={() => void copiar(datos.enlace!.url)}
            className={cn(BOTON, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent')}
          >
            {copiado ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-texto-suave">Se registró antes del video. Creá su enlace y mandáselo vos por WhatsApp.</p>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={creando}
            className={cn(BOTON, ALTO_CONTROL, 'self-start bg-brand text-brand-foreground hover:bg-brand/90')}
          >
            {creando ? 'Creando…' : 'Crear enlace del video'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive-texto">
          {error}
        </p>
      )}
    </Tarjeta>
  )
}
