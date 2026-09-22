'use client'

/**
 * La tarjeta de reels en la pestaña Difusión.
 *
 * Recibe SOLO datos planos del servidor (cadenas y booleanos). Ningún ícono ni
 * componente viaja como prop desde un componente de servidor: eso tira la
 * plataforma entera a pantalla en blanco y ningún test lo atrapa — pasó con el
 * menú lateral y está documentado en CLAUDE.md.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Instagram, Loader2, Plus, Link2 } from 'lucide-react'
import { ReelFila, type ContadoresVisibles, type ReelVisible } from './ReelFila'
import { SubirReelDialog } from './SubirReelDialog'
import { EngancharReelDialog } from './EngancharReelDialog'
import { ConfigurarReelDialog } from './ConfigurarReelDialog'

/** Donde salta el atajo "Ir a Reels" de la tarjeta de canales. */
export const ANCLA_REELS = 'reels-instagram'

interface Props {
  propertyId: string
  /** Puede crear, publicar y activar. El abogado entra con esto en false. */
  puedeGestionar: boolean
}

interface RespuestaLista {
  reels?: ReelVisible[]
  resumen?: Record<string, ContadoresVisibles>
  landing?: { publicada: boolean; slug: string | null }
  error?: string
}

/** Lee la respuesta sin explotar si el servidor devolvió HTML de error. */
async function leerJson<T>(res: Response): Promise<T> {
  const texto = await res.text()
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error('El servidor tardó demasiado en responder. Probá de nuevo.')
  }
}

export function ReelsCard({ propertyId, puedeGestionar }: Props) {
  const [reels, setReels] = useState<ReelVisible[]>([])
  const [resumen, setResumen] = useState<Record<string, ContadoresVisibles>>({})
  const [landingPublicada, setLandingPublicada] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [abrirSubir, setAbrirSubir] = useState(false)
  const [abrirEnganchar, setAbrirEnganchar] = useState(false)
  const [configurando, setConfigurando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels`)
      const cuerpo = await leerJson<RespuestaLista>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudieron cargar los reels')
      setReels(cuerpo.reels ?? [])
      setResumen(cuerpo.resumen ?? {})
      setLandingPublicada(cuerpo.landing?.publicada ?? false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [propertyId])

  useEffect(() => { void cargar() }, [cargar])

  const accion = useCallback(async (reelId: string, metodo: 'POST' | 'DELETE') => {
    setOcupado(reelId)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels/${reelId}/publicar`, {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: metodo === 'POST' ? JSON.stringify({}) : undefined,
      })
      const cuerpo = await leerJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar la acción')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setOcupado(null)
    }
  }, [propertyId, cargar])

  return (
    // `id` + `scroll-mt`: el atajo "Ir a Reels" de la tarjeta de arriba salta
    // hasta acá, y sin el margen la barra de pestañas fija taparía el título.
    <Card id={ANCLA_REELS} className="scroll-mt-40">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Instagram className="h-5 w-5 text-pink-600" aria-hidden />
          <h3 className="text-base font-semibold">Reels de Instagram</h3>
          {reels.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-5">{reels.length}</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Publicá un reel de esta propiedad y respondé solo a quien comente alguna de las palabras que elijas.
        </p>

        {/* `!cargando`: mientras la respuesta no llegó, "no hay landing" es
            desconocido, no falso. Mostrarlo igual hacía parpadear el aviso en
            fichas que SÍ tienen landing. */}
        {!cargando && !landingPublicada && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Falta publicar la landing de esta propiedad: es el enlace que recibe la persona
              cuando toca el botón.
            </span>
            <Button size="sm" variant="outline" asChild className="ml-auto h-7">
              <Link href={`/properties/${propertyId}?tab=difusion`}>Crear landing</Link>
            </Button>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {cargando ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Cargando…
          </p>
        ) : reels.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no hay reels para esta propiedad.</p>
        ) : (
          <div className="space-y-2">
            {reels.map((reel) => (
              <ReelFila
                key={reel.id}
                reel={reel}
                contadores={resumen[reel.id]}
                puedeGestionar={puedeGestionar}
                ocupado={ocupado === reel.id}
                onPublicar={(id) => void accion(id, 'POST')}
                onCancelar={(id) => void accion(id, 'DELETE')}
                onConfigurar={setConfigurando}
              />
            ))}
          </div>
        )}

        {puedeGestionar && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => setAbrirSubir(true)}>
              <Plus className="mr-1 h-3 w-3" aria-hidden /> Subir un reel
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAbrirEnganchar(true)}>
              <Link2 className="mr-1 h-3 w-3" aria-hidden /> Enganchar uno ya publicado
            </Button>
          </div>
        )}
      </CardContent>

      {puedeGestionar && (
        <>
          <SubirReelDialog
            propertyId={propertyId}
            abierto={abrirSubir}
            onCerrar={() => setAbrirSubir(false)}
            onListo={() => { setAbrirSubir(false); void cargar() }}
          />
          <EngancharReelDialog
            propertyId={propertyId}
            abierto={abrirEnganchar}
            onCerrar={() => setAbrirEnganchar(false)}
            onListo={() => { setAbrirEnganchar(false); void cargar() }}
          />
          <ConfigurarReelDialog
            propertyId={propertyId}
            reelId={configurando}
            landingPublicada={landingPublicada}
            onCerrar={() => setConfigurando(null)}
            onListo={() => { setConfigurando(null); void cargar() }}
          />
        </>
      )}
    </Card>
  )
}
