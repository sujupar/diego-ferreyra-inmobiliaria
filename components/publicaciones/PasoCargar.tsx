'use client'

import { useRef, useState } from 'react'
import { ArrowRight, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VideoVista } from '@/lib/publicaciones/tipos'
import { FilaVideo } from './FilaVideo'

interface Props {
  videos: VideoVista[]
  progreso: Record<string, number>
  errores: Record<string, string>
  faltaArchivo: (v: VideoVista) => boolean
  agregando: boolean
  onElegir: (archivos: File[]) => void
  onReintentar: (v: VideoVista) => void
  onQuitar: (v: VideoVista) => void
  onSiguiente: () => void
}

export function PasoCargar({
  videos,
  progreso,
  errores,
  faltaArchivo,
  agregando,
  onElegir,
  onReintentar,
  onQuitar,
  onSiguiente,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  const listos = videos.filter((v) => v.etapa === 'listo').length

  const elegir = (lista: FileList | null) => {
    if (lista && lista.length > 0) onElegir(Array.from(lista))
  }

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          elegir(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
          encima ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
      >
        {agregando ? (
          <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <UploadCloud className="h-9 w-9 text-muted-foreground" aria-hidden />
        )}
        <div className="space-y-1">
          <p className="font-medium">Arrastrá los videos acá</p>
          <p className="text-sm text-muted-foreground">MP4 o MOV, hasta 200 MB cada uno</p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={agregando}>
          Elegilos de la computadora
        </Button>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            elegir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {videos.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              {videos.length} {videos.length === 1 ? 'video' : 'videos'} · {listos} {listos === 1 ? 'listo' : 'listos'}
            </p>
            <p className="text-xs text-muted-foreground">Se guarda solo: podés cerrar y seguir después</p>
          </div>
          <ul className="space-y-2">
            {videos.map((v) => (
              <FilaVideo
                key={v.id}
                video={v}
                progreso={progreso[v.id]}
                errorLocal={errores[v.id]}
                faltaArchivo={faltaArchivo(v)}
                onReintentar={() => onReintentar(v)}
                onQuitar={() => onQuitar(v)}
              />
            ))}
          </ul>
          <div className="flex justify-end">
            <Button onClick={onSiguiente} size="lg">
              Siguiente: elegir ritmo <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
