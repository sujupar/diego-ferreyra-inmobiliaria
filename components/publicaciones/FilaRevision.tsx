'use client'

/**
 * Una fila de la revisión (y de Programado): miniatura que abre el video, día y
 * hora editables, redes, descripción y título de YouTube.
 */
import { useState } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, Hand, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { aHoraArgentina } from '@/lib/publicaciones/calendario'
import { LIMITES } from '@/lib/publicaciones/textos'
import { SIN_VOZ, type EnvioFila, type Plataforma, type VideoVista } from '@/lib/publicaciones/tipos'
import { Miniatura } from './FilaVideo'
import { duracion } from './formato'
import { IconosRedes, REDES } from './IconosRedes'

/** YouTube trata como Short solo lo que dura hasta 3 minutos. */
const TOPE_SHORT_SEG = 180

export type CambiosVideo = Partial<
  Pick<VideoVista, 'descripcion' | 'titulo_youtube' | 'redes' | 'programado_para' | 'hora_manual' | 'pausado'>
>

interface Props {
  video: VideoVista
  editable: boolean
  onCambio: (campos: CambiosVideo) => void
  envios?: EnvioFila[]
  arrastre?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }
  acciones?: React.ReactNode
}

const ESTADO_ENVIO: Record<string, string> = {
  programado: 'Programado',
  en_curso: 'Publicando',
  publicado: 'Publicado',
  fallido: 'Falló',
  cancelado: 'Cancelado',
}

export function FilaRevision({ video, editable, onCambio, envios, arrastre, acciones }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [verVideo, setVerVideo] = useState(false)
  const ar = video.programado_para ? aHoraArgentina(new Date(video.programado_para)) : null
  const sinVoz = video.ultimo_error === SIN_VOZ && !video.descripcion.trim()

  const cambiarHora = (fecha: string, hora: string) => {
    if (!fecha || !hora) return
    const instante = new Date(`${fecha}T${hora}:00-03:00`)
    if (Number.isNaN(instante.getTime())) return
    if (instante.getTime() <= Date.now()) {
      toast.error('Ese horario ya pasó')
      return
    }
    onCambio({ programado_para: instante.toISOString(), hora_manual: true })
  }

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        {arrastre && (
          <button
            type="button"
            className="mt-8 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label={`Mover ${video.nombre_archivo}`}
            {...arrastre.attributes}
            {...arrastre.listeners}
          >
            <GripVertical className="h-5 w-5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => video.video_url && setVerVideo(true)}
          aria-label={`Ver ${video.nombre_archivo}`}
          className="shrink-0"
        >
          <Miniatura url={video.miniatura_url} nombre={video.nombre_archivo} className="h-28 w-16" />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label="Día"
              className="h-8 w-[9.5rem]"
              value={ar?.fecha ?? ''}
              disabled={!editable}
              onChange={(e) => cambiarHora(e.target.value, ar?.hora ?? '19:00')}
            />
            <Input
              type="time"
              aria-label="Hora"
              className="h-8 w-[6.5rem]"
              value={ar?.hora ?? ''}
              disabled={!editable}
              onChange={(e) => ar && cambiarHora(ar.fecha, e.target.value)}
            />
            {video.hora_manual && (
              <Badge variant="secondary" className="gap-1">
                <Hand className="h-3 w-3" aria-hidden /> hora manual
                {editable && (
                  <button
                    type="button"
                    aria-label="Volver al horario automático"
                    title="Volver al horario automático (se aplica al reordenar o cambiar el ritmo)"
                    onClick={() => onCambio({ hora_manual: false })}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </Badge>
            )}
            {video.pausado && <Badge variant="outline">Pausado</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <IconosRedes redes={video.redes} deshabilitado={!editable} onCambio={(redes: Plataforma[]) => onCambio({ redes })} />
            {envios && envios.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {envios.map((e) => (
                  <Badge key={e.plataforma} variant={e.estado === 'cancelado' ? 'outline' : 'secondary'} className="text-[11px]">
                    {REDES[e.plataforma].nombre.replace(' (borrador)', '')}: {ESTADO_ENVIO[e.estado]}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {sinVoz && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Sin voz: escribí la descripción
            </p>
          )}
          {(video.duracion_seg ?? 0) > TOPE_SHORT_SEG && video.redes.includes('youtube') && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> YouTube: va como video común, no como Short ({duracion(video.duracion_seg)})
            </p>
          )}

          {!abierto ? (
            <button type="button" className="block w-full text-left" onClick={() => setAbierto(true)}>
              <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                {video.descripcion || 'Sin descripción todavía'}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Editar texto <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <Textarea
                  aria-label="Descripción"
                  rows={6}
                  maxLength={LIMITES.descripcion}
                  value={video.descripcion}
                  disabled={!editable}
                  onChange={(e) => onCambio({ descripcion: e.target.value })}
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {video.descripcion.length}/{LIMITES.descripcion}
                </p>
              </div>
              {video.redes.includes('youtube') && (
                <div className="space-y-1">
                  <Input
                    aria-label="Título de YouTube"
                    placeholder="Título de YouTube"
                    maxLength={LIMITES.tituloYoutube}
                    value={video.titulo_youtube}
                    disabled={!editable}
                    onChange={(e) => onCambio({ titulo_youtube: e.target.value.replace(/[<>]/g, '') })}
                  />
                  <p className="text-right text-[11px] text-muted-foreground">
                    Título de YouTube {video.titulo_youtube.length}/{LIMITES.tituloYoutube}
                  </p>
                </div>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                onClick={() => setAbierto(false)}
              >
                Cerrar <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}
          {acciones && <div className="flex flex-wrap gap-2 pt-1">{acciones}</div>}
        </div>
      </div>

      <Dialog open={verVideo} onOpenChange={setVerVideo}>
        <DialogContent className="max-w-sm p-2">
          <DialogTitle className="sr-only">{video.nombre_archivo}</DialogTitle>
          {verVideo && video.video_url && (
            <video src={video.video_url} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-md bg-black" />
          )}
        </DialogContent>
      </Dialog>
    </li>
  )
}
