'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { REEL_EXTS } from '@/lib/properties/media'
import { subirReel, validarArchivoReel } from '@/lib/properties/upload-reel'
import { CampoPalabras, palabrasSonValidas } from './CampoPalabras'
import { RevisionMensajes, mensajesDeFabrica, problemaDeMensajes, type MensajesEditables } from './RevisionMensajes'
import { separarPalabras } from '@/lib/social/reels/palabra-clave'

interface Props {
  propertyId: string
  abierto: boolean
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

export function SubirReelDialog({ propertyId, abierto, slugLanding, privadosActivos, onCerrar, onListo }: Props) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [palabra, setPalabra] = useState('')
  // Dos pasos, igual que al enganchar: el segundo (revisar los mensajes) es
  // obligatorio. El video se sube recién al confirmar el paso 2.
  const [paso, setPaso] = useState<1 | 2>(1)
  const [mensajes, setMensajes] = useState<MensajesEditables>(mensajesDeFabrica)
  const [progreso, setProgreso] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cada vez que se abre arranca en el paso 1, con los textos de fábrica.
  useEffect(() => {
    if (!abierto) return
    setPaso(1)
    setMensajes(mensajesDeFabrica())
  }, [abierto])

  const elegir = (file: File | null) => {
    setError(null)
    if (!file) { setArchivo(null); return }
    // Se valida ACÁ, antes de que espere una subida de 150 MB que el servidor va
    // a rechazar igual.
    const problema = validarArchivoReel(file)
    if (problema) { setError(problema); setArchivo(null); return }
    setArchivo(file)
  }

  const confirmar = async () => {
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      const videoUrl = await subirReel(propertyId, archivo, setProgreso)
      const res = await fetch(`/api/properties/${propertyId}/reels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origen: 'subido', videoUrl, palabraClave: palabra.trim() || undefined, mensajes }),
      })
      const cuerpo = await leerJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo guardar el reel')

      setArchivo(null); setPalabra(''); setProgreso(0); setPaso(1); setMensajes(mensajesDeFabrica())
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !subiendo && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{paso === 1 ? 'Subir un reel' : 'Revisá los mensajes'}</DialogTitle>
          <DialogDescription>
            {paso === 1
              ? 'Paso 1 de 2 · El video y las palabras. La descripción se arma sola y la revisás antes de publicar.'
              : 'Paso 2 de 2 · Esto es exactamente lo que va a recibir la gente. Editalo si querés. El reel queda Apagado hasta que lo prendas.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {paso === 2 ? (
            <RevisionMensajes
              valor={mensajes}
              onCambiar={setMensajes}
              palabraDeEjemplo={separarPalabras(palabra)[0] ?? ''}
              slugLanding={slugLanding}
              privadosActivos={privadosActivos}
              deshabilitado={subiendo}
            />
          ) : (
          <>
          <div className="space-y-1.5">
            <Label htmlFor="archivo-reel">Video</Label>
            <Input
              id="archivo-reel"
              type="file"
              accept={REEL_EXTS.map((e) => `.${e}`).join(',')}
              disabled={subiendo}
              onChange={(e) => elegir(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Instagram solo acepta {REEL_EXTS.join(' y ')}. Hasta 200 MB.
            </p>
            {/* Al volver del paso 2 el campo de archivo se ve vacío aunque el
                video siga elegido: se dice cuál es para no hacerlo elegir de nuevo. */}
            {archivo && <p className="text-xs">Elegido: <strong>{archivo.name}</strong></p>}
          </div>

          <CampoPalabras
            id="palabra-reel"
            valor={palabra}
            onCambiar={setPalabra}
            deshabilitado={subiendo}
          />
          </>
          )}

          {subiendo && progreso > 0 && (
            <div className="space-y-1">
              <Progress value={progreso} />
              <p className="text-xs text-muted-foreground">Subiendo… {progreso}%</p>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {paso === 1 ? (
            <>
              <Button variant="ghost" onClick={onCerrar} disabled={subiendo}>Cancelar</Button>
              <Button
                onClick={() => setPaso(2)}
                disabled={!archivo || !palabrasSonValidas(palabra) || separarPalabras(palabra).length === 0}
              >
                Siguiente: revisar los mensajes
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPaso(1)} disabled={subiendo}>
                <ArrowLeft className="mr-1 h-3 w-3" aria-hidden /> Atrás
              </Button>
              <Button onClick={() => void confirmar()} disabled={!archivo || subiendo || !!problemaDeMensajes(mensajes)}>
                {subiendo && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                Subir y guardar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
