'use client'
import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_CAPTURA_BYTES } from '@/lib/informes/archivos'
import type { Capturas, NombreCaptura } from '@/lib/informes/tipos'
import { quitarCaptura, subirCaptura } from './api'

/**
 * Captura del panel de un portal sin API (Zonaprop, Argenprop, MercadoLibre, TikTok). Si hay
 * captura, el PDF la muestra en lugar de las tarjetas con números (como en los ejemplos).
 */
export function CapturaPortal({ informeId, cual, portal, url, onCambio, deshabilitado }: {
  informeId: string
  cual: NombreCaptura
  portal: string
  url: string | undefined
  onCambio: (c: Capturas) => void
  deshabilitado: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function elegir(archivo: File | undefined) {
    if (!archivo) return
    setError(null)
    if (archivo.size > MAX_CAPTURA_BYTES) { setError('La captura no puede pasar de 5 MB'); return }
    setOcupado(true)
    try {
      onCambio(await subirCaptura(informeId, cual, archivo))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos subir la captura')
    } finally {
      setOcupado(false)
      if (input.current) input.current.value = ''
    }
  }

  async function quitar() {
    setOcupado(true)
    setError(null)
    try {
      onCambio(await quitarCaptura(informeId, cual))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos quitar la captura')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Captura de {portal} <span className="font-normal text-muted-foreground">(opcional: si la subís, el informe muestra la captura en vez de los números)</span></p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage privado, next/image no la puede optimizar
        <img src={url} alt={`Captura de ${portal}`} className="max-h-48 w-auto rounded-md border" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Elegir captura de ${portal}`} onChange={e => elegir(e.target.files?.[0])} />
        <Button type="button" variant="outline" className="min-h-11" disabled={deshabilitado || ocupado} onClick={() => input.current?.click()}>
          {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="mr-1 h-4 w-4" aria-hidden />}
          {url ? 'Cambiar captura' : 'Subir captura'}
        </Button>
        {url ? (
          <Button type="button" variant="ghost" className="min-h-11" disabled={deshabilitado || ocupado} onClick={quitar}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Quitar
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
