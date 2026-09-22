'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { REEL_EXTS } from '@/lib/properties/media'
import { subirReel, validarArchivoReel } from '@/lib/properties/upload-reel'
import { CampoPalabras, palabrasSonValidas } from './CampoPalabras'

interface Props {
  propertyId: string
  abierto: boolean
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

export function SubirReelDialog({ propertyId, abierto, onCerrar, onListo }: Props) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [palabra, setPalabra] = useState('')
  const [progreso, setProgreso] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        body: JSON.stringify({ origen: 'subido', videoUrl, palabraClave: palabra.trim() || undefined }),
      })
      const cuerpo = await leerJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo guardar el reel')

      setArchivo(null); setPalabra(''); setProgreso(0)
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !subiendo && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir un reel</DialogTitle>
          <DialogDescription>
            El video se publica en Instagram con una descripción que podés revisar y editar antes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
          </div>

          <CampoPalabras
            id="palabra-reel"
            valor={palabra}
            onCambiar={setPalabra}
            deshabilitado={subiendo}
          />

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
          <Button variant="ghost" onClick={onCerrar} disabled={subiendo}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={!archivo || subiendo || !palabrasSonValidas(palabra)}>
            {subiendo && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
