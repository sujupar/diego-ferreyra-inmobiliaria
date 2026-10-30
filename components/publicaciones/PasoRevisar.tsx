'use client'

/**
 * Paso 3: la lista en el orden en que van a salir. Arrastrar cambia el orden y
 * los horarios se quedan quietos (el que queda primero toma el más temprano).
 */
import { useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { reasignarHorarios } from '@/lib/publicaciones/calendario'
import type { VideoVista } from '@/lib/publicaciones/tipos'
import { FilaRevision, type CambiosVideo } from './FilaRevision'
import { diaLargo } from './formato'
import { api } from './leer-json'
import type { EstadoGuardado } from './useAutoguardado'

interface Props {
  tandaId: string
  videos: VideoVista[]
  estadoGuardado: EstadoGuardado
  onVideos: (videos: VideoVista[]) => void
  guardar: (videoId: string, campos: Record<string, unknown>) => void
  vaciar: () => Promise<void>
  onProgramada: () => void
}

function ItemOrdenable({ video, onCambio }: { video: VideoVista; onCambio: (c: CambiosVideo) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: video.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: 'relative' }}
      className={isDragging ? 'shadow-lg' : undefined}
    >
      <FilaRevision video={video} editable onCambio={onCambio} arrastre={{ attributes, listeners }} />
    </div>
  )
}

export function PasoRevisar({ tandaId, videos, estadoGuardado, onVideos, guardar, vaciar, onProgramada }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [preguntar, setPreguntar] = useState(false)
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const sinTerminar = videos.filter((v) => v.etapa !== 'listo').length
  const sinHora = videos.filter((v) => !v.programado_para).length
  const publicaciones = videos.reduce((n, v) => n + v.redes.length, 0)
  const fechas = videos.map((v) => v.programado_para).filter((f): f is string => !!f).sort()

  const cambiar = (id: string, campos: CambiosVideo) => {
    // descripcion_editada solo en pantalla: el servidor lo marca solo al recibir la descripción.
    const marca = {
      ...(campos.descripcion !== undefined ? { descripcion_editada: true } : {}),
      ...(campos.titulo_youtube !== undefined ? { titulo_editado: true } : {}),
    }
    onVideos(videos.map((v) => (v.id === id ? { ...v, ...campos, ...marca } : v)))
    guardar(id, campos)
  }

  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const desde = videos.findIndex((v) => v.id === active.id)
    const hasta = videos.findIndex((v) => v.id === over.id)
    const movidos = reasignarHorarios(arrayMove(videos, desde, hasta)).map((v, orden) => ({ ...v, orden }))
    const antes = new Map(videos.map((v) => [v.id, v]))
    onVideos(movidos)
    for (const v of movidos) {
      const previo = antes.get(v.id)!
      const campos: Record<string, unknown> = {}
      if (previo.orden !== v.orden) campos.orden = v.orden
      if (previo.programado_para !== v.programado_para && v.programado_para) campos.programado_para = v.programado_para
      if (Object.keys(campos).length) guardar(v.id, campos)
    }
  }

  const programar = async () => {
    if (confirmando) return
    setConfirmando(true)
    try {
      await vaciar()
      await api(`/api/publicaciones/tandas/${tandaId}/confirmar`, { method: 'POST' })
      toast.success(`${videos.length} ${videos.length === 1 ? 'video programado' : 'videos programados'}`)
      setPreguntar(false)
      onProgramada()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo programar')
    } finally {
      setConfirmando(false)
    }
  }

  const motivo = sinTerminar
    ? `Faltan terminar ${sinTerminar} ${sinTerminar === 1 ? 'video' : 'videos'}`
    : sinHora
      ? `Hay ${sinHora} sin día y hora`
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Revisá y ajustá</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {estadoGuardado === 'guardando' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Guardando…
            </>
          ) : estadoGuardado === 'error' ? (
            <span className="text-destructive">No se guardó el último cambio</span>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden /> Guardado
            </>
          )}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Arrastrá desde ⋮⋮ para cambiar el orden. Tocá la miniatura para ver el video.</p>

      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
        <SortableContext items={videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {videos.map((v) => (
              <ItemOrdenable key={v.id} video={v} onCambio={(c) => cambiar(v.id, c)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* sticky y no fixed: así respeta el ancho del menú lateral, abierto o colapsado */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {motivo && <p className="text-sm text-muted-foreground">{motivo}</p>}
          <Button size="lg" disabled={!!motivo || confirmando} onClick={() => setPreguntar(true)}>
            Programar {videos.length} {videos.length === 1 ? 'video' : 'videos'}
          </Button>
        </div>
      </div>

      <Dialog open={preguntar} onOpenChange={(o) => !confirmando && setPreguntar(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Programamos todo?</DialogTitle>
            <DialogDescription>
              {videos.length} {videos.length === 1 ? 'video' : 'videos'} · {publicaciones} publicaciones
              {fechas.length > 0 && ` · del ${diaLargo(fechas[0])} al ${diaLargo(fechas[fechas.length - 1])}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreguntar(false)} disabled={confirmando}>
              Seguir revisando
            </Button>
            <Button onClick={() => void programar()} disabled={confirmando}>
              {confirmando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              Programar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
