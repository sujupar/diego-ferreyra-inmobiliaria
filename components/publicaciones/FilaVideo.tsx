'use client'

import { AlertCircle, Check, Film, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { etiquetaEtapa } from '@/lib/publicaciones/preparacion'
import { SIN_VOZ, type VideoVista } from '@/lib/publicaciones/tipos'
import { duracion, megas } from './formato'

interface Props {
  video: VideoVista
  progreso?: number
  errorLocal?: string
  /** `subiendo` sin el archivo en memoria: hay que volver a elegirlo. */
  faltaArchivo: boolean
  onReintentar: () => void
  onQuitar: () => void
}

export function Miniatura({ url, nombre, className = 'h-24 w-14' }: { url: string | null; nombre: string; className?: string }) {
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-md bg-muted`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Miniatura de ${nombre}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Film className="h-5 w-5" aria-hidden />
        </div>
      )}
    </div>
  )
}

export function FilaVideo({ video, progreso, errorLocal, faltaArchivo, onReintentar, onQuitar }: Props) {
  const enError = video.etapa === 'error' || !!errorLocal
  const trabajando = !enError && !faltaArchivo && video.etapa !== 'listo'
  const mensajeError = errorLocal ?? video.ultimo_error ?? 'No se pudo preparar'
  const sinVoz = video.etapa === 'listo' && video.ultimo_error === SIN_VOZ

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
      <Miniatura url={video.miniatura_url} nombre={video.nombre_archivo} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" title={video.nombre_archivo}>
          {video.nombre_archivo}
        </p>
        <p className="text-xs text-muted-foreground">
          {[duracion(video.duracion_seg), megas(video.tamano_bytes)].filter(Boolean).join(' · ')}
        </p>
        {faltaArchivo ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <Upload className="h-3.5 w-3.5" aria-hidden /> Volvé a elegir este archivo para terminar de subirlo
          </p>
        ) : enError ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {mensajeError}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {trabajando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            )}
            {sinVoz ? 'Sin voz: escribí la descripción' : etiquetaEtapa(video.etapa, progreso)}
          </p>
        )}
        {video.etapa === 'subiendo' && progreso !== undefined && (
          <Progress value={progreso} className="h-1.5" aria-label="Progreso de subida" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {enError && (
          <Button size="sm" variant="outline" onClick={onReintentar}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden /> Reintentar
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onQuitar} aria-label={`Quitar ${video.nombre_archivo}`}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  )
}
