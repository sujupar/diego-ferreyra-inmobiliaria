'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, RefreshCw, Check, Copy, Undo2, X } from 'lucide-react'
import {
  datosParaDescripcion,
  faltaParaGenerar,
  textoParaElCampo,
  type FormularioAlta,
} from '@/lib/properties/descripcion-desde-alta'

interface Generada {
  title: string
  subtitle: string
  body: string
}

/**
 * Lee la respuesta sin confiar en que sea JSON.
 *
 * Cuando una función de Netlify se pasa de tiempo, el gateway devuelve una
 * PÁGINA HTML de error: `res.json()` explota con «Unexpected token '<'», un
 * mensaje que no le dice nada a nadie. Mismo patrón que `readJson` en
 * `components/properties/LandingSection.tsx`.
 */
async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
  const texto = await res.text()
  try {
    return JSON.parse(texto) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
  }
}

export interface GenerarDescripcionProps {
  form: FormularioAlta
  /** Escribe el texto en el campo Descripción del formulario. */
  onAplicar: (texto: string) => void
  /** Avisa que hay una generación en curso (el alta bloquea "Captar Propiedad"). */
  onGenerandoChange?: (generando: boolean) => void
}

/**
 * Botón "Generar descripción" del alta manual, con vista previa.
 *
 * Decisiones de uso, todas a propósito:
 *  - Va AL FINAL del formulario porque el dueño pidió "llenar todo y, al final,
 *    generar": el modelo escribe con lo que haya cargado, así que generar a
 *    mitad de camino produce un aviso genérico.
 *  - Lo generado NO pisa lo escrito sin permiso: primero se muestra, y recién
 *    con "Usar esta descripción" entra al campo. Después queda "Deshacer", que
 *    restaura exactamente el texto anterior.
 *  - El TITULAR se muestra para copiar pero NO se guarda: `properties.title` lo
 *    leen el Inbox, el nombre de la campaña en Ads Manager, la landing pública y
 *    los portales, y no hay pantalla para corregirlo después.
 */
export function GenerarDescripcion({ form, onAplicar, onGenerandoChange }: GenerarDescripcionProps) {
  const [generando, setGenerando] = useState(false)
  const [resultado, setResultado] = useState<Generada | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [aplicado, setAplicado] = useState(false)
  /** El texto que había en el campo antes de aplicar — habilita "Deshacer". */
  const [textoAnterior, setTextoAnterior] = useState<string | null>(null)
  /** Lo último que ESTE componente cargó en el campo (no vuelve al modelo). */
  const [ultimoGenerado, setUltimoGenerado] = useState<string | null>(null)

  const faltan = faltaParaGenerar(form)
  const puedeGenerar = faltan.length === 0

  function marcarGenerando(valor: boolean) {
    setGenerando(valor)
    onGenerandoChange?.(valor)
  }

  async function generar() {
    if (!puedeGenerar || generando) return
    marcarGenerando(true)
    setError(null)
    try {
      const res = await fetch('/api/properties/generate-description', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          datos: datosParaDescripcion(form, { textoGenerado: ultimoGenerado }),
        }),
      })
      const data = await leerJson<{ generated?: Generada }>(res)
      if (!res.ok || !data.generated) {
        throw new Error(data.error || 'No se pudo generar la descripción.')
      }
      setResultado(data.generated)
      setAplicado(false)
    } catch (e) {
      setResultado(null)
      setError(e instanceof Error ? e.message : 'No se pudo generar la descripción.')
    } finally {
      marcarGenerando(false)
    }
  }

  function aplicar() {
    if (!resultado) return
    const texto = textoParaElCampo(resultado)
    setTextoAnterior(form.description ?? '')
    setUltimoGenerado(texto)
    onAplicar(texto)
    setAplicado(true)
  }

  function deshacer() {
    if (textoAnterior === null) return
    onAplicar(textoAnterior)
    setTextoAnterior(null)
    setUltimoGenerado(null)
    setAplicado(false)
  }

  async function copiarTitular() {
    if (!resultado) return
    try {
      await navigator.clipboard?.writeText(resultado.title)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* sin portapapeles (navegador viejo o permiso denegado): el texto está a la vista */
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={generar} disabled={!puedeGenerar || generando}>
          {generando ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : resultado ? (
            <RefreshCw className="h-4 w-4 mr-1" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1" />
          )}
          {generando ? 'Generando…' : resultado ? 'Volver a generar' : 'Generar descripción'}
        </Button>

        {aplicado && textoAnterior !== null && (
          <Button type="button" variant="ghost" size="sm" onClick={deshacer}>
            <Undo2 className="h-4 w-4 mr-1" /> Deshacer
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {puedeGenerar
          ? 'Escribe el aviso con el mismo sistema que usamos para los portales, con los datos que cargaste acá. Podés editarlo antes de captar.'
          : `Completá ${faltan.join(', ')} para poder generar la descripción.`}
      </p>

      {generando && (
        <p className="text-xs text-muted-foreground">
          Puede tardar hasta medio minuto. No cierres la pantalla.
        </p>
      )}

      {error && <p className="text-sm text-[color:var(--destructive)]">{error}</p>}

      {resultado && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide">Titular</span>
              <button
                type="button"
                onClick={copiarTitular}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-sm font-medium">{resultado.title}</p>
            <p className="text-xs text-muted-foreground">
              El titular no se guarda en la ficha: copialo para pegarlo cuando publiques en el portal.
            </p>
          </div>

          <div>
            <span className="text-xs font-medium uppercase tracking-wide">Subtítulo</span>
            <p className="text-sm italic">{resultado.subtitle}</p>
          </div>

          <div>
            <span className="text-xs font-medium uppercase tracking-wide">Descripción</span>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{resultado.body}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={aplicar} disabled={generando}>
              <Check className="h-4 w-4 mr-1" /> Usar esta descripción
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setResultado(null); setAplicado(false) }}
              disabled={generando}
            >
              <X className="h-4 w-4 mr-1" /> Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
