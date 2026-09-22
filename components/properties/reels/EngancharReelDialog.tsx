'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ArrowLeft, Info, Loader2, MessageCircle } from 'lucide-react'
import { CampoPalabras, palabrasSonValidas } from './CampoPalabras'
import { RevisionMensajes, mensajesDeFabrica, problemaDeMensajes, type MensajesEditables } from './RevisionMensajes'
import { separarPalabras } from '@/lib/social/reels/palabra-clave'

interface ReelDeInstagram {
  id: string
  permalink: string | null
  descripcion: string | null
  miniatura: string | null
  fecha: string | null
  comentarios: number
  yaEnganchado: boolean
}

interface Props {
  propertyId: string
  abierto: boolean
  /** Para mostrar el enlace real en la revisión de mensajes. */
  slugLanding: string | null
  privadosActivos: boolean
  onCerrar: () => void
  onListo: () => void
}

async function leerJson<T>(res: Response): Promise<T> {
  const texto = await res.text()
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error('El servidor tardó demasiado en responder. Probá de nuevo.')
  }
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const f = new Date(iso)
  return Number.isNaN(f.getTime()) ? '' : f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function EngancharReelDialog({ propertyId, abierto, slugLanding, privadosActivos, onCerrar, onListo }: Props) {
  const [reels, setReels] = useState<ReelDeInstagram[]>([])
  const [elegido, setElegido] = useState<string | null>(null)
  const [palabra, setPalabra] = useState('')
  // Dos pasos: 1) reel + palabras, 2) revisar los mensajes. El segundo es
  // OBLIGATORIO (pedido del dueño, 2026-09-22): no se engancha nada sin ver
  // antes qué se le va a decir a la gente.
  const [paso, setPaso] = useState<1 | 2>(1)
  const [mensajes, setMensajes] = useState<MensajesEditables>(mensajesDeFabrica)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/instagram/media')
      const cuerpo = await leerJson<{ reels?: ReelDeInstagram[]; error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudieron traer los reels')
      setReels(cuerpo.reels ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [])

  // Cada vez que se abre arranca en el paso 1, con los textos de fábrica.
  useEffect(() => {
    if (!abierto) return
    setPaso(1)
    setMensajes(mensajesDeFabrica())
    void cargar()
  }, [abierto, cargar])

  const confirmar = async () => {
    if (!elegido) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origen: 'existente', igMediaId: elegido, palabraClave: palabra.trim() || undefined, mensajes }),
      })
      const cuerpo = await leerJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo enganchar el reel')
      setElegido(null); setPalabra(''); setPaso(1); setMensajes(mensajesDeFabrica())
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{paso === 1 ? 'Enganchar un reel ya publicado' : 'Revisá los mensajes'}</DialogTitle>
          <DialogDescription>
            {paso === 1
              ? 'Paso 1 de 2 · Elegí el reel y las palabras que activan la respuesta.'
              : 'Paso 2 de 2 · Esto es exactamente lo que va a recibir la gente. Editalo si querés. El reel queda Apagado hasta que lo prendas.'}
          </DialogDescription>
        </DialogHeader>

        {paso === 2 ? (
          <RevisionMensajes
            valor={mensajes}
            onCambiar={setMensajes}
            palabraDeEjemplo={separarPalabras(palabra)[0] ?? ''}
            slugLanding={slugLanding}
            privadosActivos={privadosActivos}
            deshabilitado={guardando}
          />
        ) : (
        <>
        {/* Este aviso NO es decorativo: es una decisión de diseño que el asesor
            tiene que conocer ANTES de confirmar, no descubrir después. */}
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            La automatización solo va a responder los comentarios <strong>nuevos</strong>. Los que
            ya están no se tocan: contestarle hoy a alguien que comentó hace días se ve como spam
            y Instagram puede limitar la cuenta.
          </span>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {cargando && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Trayendo los reels de Instagram…
            </p>
          )}

          {!cargando && reels.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">No se encontraron reels en la cuenta.</p>
          )}

          {reels.map((reel) => (
            <button
              key={reel.id}
              type="button"
              disabled={reel.yaEnganchado || guardando}
              onClick={() => setElegido(reel.id)}
              className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                elegido === reel.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              } ${reel.yaEnganchado ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {reel.miniatura ? (
                /* Imagen simple y no `next/image` a propósito: el CDN de Instagram no
                   está en `remotePatterns` y sus miniaturas son enlaces FIRMADOS que
                   vencen. Pasarlas por el optimizador las cachearía y quedarían rotas
                   al día siguiente; agregar el dominio tampoco arregla el vencimiento. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reel.miniatura}
                  alt=""
                  className="h-16 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-16 w-12 shrink-0 rounded bg-muted" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{reel.descripcion?.slice(0, 80) || 'Sin descripción'}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{fechaCorta(reel.fecha)}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" aria-hidden />
                    {reel.comentarios}
                  </span>
                </p>
              </div>

              {reel.yaEnganchado && (
                <Badge variant="outline" className="shrink-0 text-[10px] h-5">Ya enganchado</Badge>
              )}
            </button>
          ))}
        </div>

        <CampoPalabras
          id="palabra-enganchar"
          valor={palabra}
          onCambiar={setPalabra}
          deshabilitado={guardando}
          conDescripcion={false}
        />
        </>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <DialogFooter>
          {paso === 1 ? (
            <>
              <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
              <Button
                onClick={() => setPaso(2)}
                disabled={!elegido || !palabrasSonValidas(palabra) || separarPalabras(palabra).length === 0}
              >
                Siguiente: revisar los mensajes
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPaso(1)} disabled={guardando}>
                <ArrowLeft className="mr-1 h-3 w-3" aria-hidden /> Atrás
              </Button>
              <Button onClick={() => void confirmar()} disabled={!elegido || guardando || !!problemaDeMensajes(mensajes)}>
                {guardando && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                Enganchar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
