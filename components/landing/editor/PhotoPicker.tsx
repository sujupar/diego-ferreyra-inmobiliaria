'use client'
/**
 * E1.6 Editor — elige/reordena fotos de la propiedad por ÍNDICE (no sube ni borra
 * nada: eso vive en Multimedia). Modo 'single' = portada/historia (1 índice). Modo
 * 'multi' = galería (varios índices, con drag para reordenar; patrón de PhotoGallery).
 */
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

function Thumb({ url, index, selected, onClick }: {
  url: string; index: number; selected: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`relative aspect-[4/3] overflow-hidden rounded-md ${selected ? 'ring-2 ring-[color:var(--brand)]' : 'ring-1 ring-border'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
    </button>
  )
}

function SortableThumb({ id, url, index, onRemove }: {
  id: string; url: string; index: number; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="relative aspect-[4/3] overflow-hidden rounded-md ring-1 ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Quitar de la galería"
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white">×</button>
      <button type="button" {...attributes} {...listeners} aria-label="Arrastrar"
        className="absolute bottom-1 right-1 flex h-5 w-5 cursor-grab touch-none items-center justify-center rounded-full bg-black/40 text-white">
        <GripVertical className="h-3 w-3" />
      </button>
    </div>
  )
}

interface SingleProps { mode: 'single'; photos: string[]; value: number; onPick: (index: number) => void }
interface MultiProps { mode: 'multi'; photos: string[]; value: number[]; onReorder: (indices: number[]) => void }

export function PhotoPicker(props: SingleProps | MultiProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (props.mode === 'single') {
    const { photos, value, onPick } = props
    return (
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <Thumb key={i} url={url} index={i} selected={i === value} onClick={() => onPick(i)} />
        ))}
      </div>
    )
  }

  // Desestructuramos a consts: el narrowing de props a MultiProps no persiste dentro
  // del closure onDragEnd (limitación de TS con parámetros capturados).
  const { photos, value, onReorder } = props
  // Descartamos índices fuera de rango (fotos borradas en Multimedia): no muestran
  // miniatura rota y, al reordenar/quitar, quedan saneados en el borrador.
  const selected = value.filter((i) => i >= 0 && i < photos.length)
  const available = photos.map((_, i) => i).filter((i) => !selected.includes(i))
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = selected.indexOf(Number(active.id))
    const to = selected.indexOf(Number(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(selected, from, to))
  }
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">En la galería ({selected.length}). Arrastrá para reordenar.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={selected.map(String)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {selected.map((idx) => (
              <SortableThumb key={idx} id={String(idx)} url={photos[idx]} index={idx}
                onRemove={() => onReorder(selected.filter((i) => i !== idx))} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {available.length > 0 && (
        <>
          <p className="text-[11px] text-muted-foreground">Agregar fotos</p>
          <div className="grid grid-cols-3 gap-2">
            {available.map((idx) => (
              <Thumb key={idx} url={photos[idx]} index={idx} selected={false}
                onClick={() => onReorder([...selected, idx])} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
