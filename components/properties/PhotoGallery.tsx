'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, X, GripVertical } from 'lucide-react'

interface Props {
  propertyId: string
  photos: string[]
  onChanged: () => void
}

function SortablePhoto({ url, index, onDelete, onOpen }: { url: string; index: number; onDelete: (u: string) => void; onOpen: (i: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const isCover = index < 3
  return (
    <div ref={setNodeRef} style={style} className={`relative rounded-xl overflow-hidden aspect-[4/3] bg-muted group ${isCover ? 'ring-2 ring-[color:var(--brand)]' : ''}`}>
      <img src={url} alt={`Foto ${index + 1}`} className="w-full h-full object-cover cursor-zoom-in" onClick={() => onOpen(index)} />
      {isCover && (
        <span className="absolute top-1.5 left-1.5 bg-[color:var(--brand)] text-white text-[11px] font-bold rounded-md px-2 py-0.5 shadow">
          Portada {index + 1}
        </span>
      )}
      <button type="button" onClick={() => onDelete(url)} aria-label="Eliminar foto"
        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
        <X className="h-3.5 w-3.5" />
      </button>
      <button type="button" {...attributes} {...listeners} aria-label="Arrastrar para reordenar"
        className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/40 text-white flex items-center justify-center cursor-grab touch-none">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function PhotoGallery({ propertyId, photos, onChanged }: Props) {
  const [items, setItems] = useState<string[]>(photos)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => { setItems(photos) }, [photos])

  async function persistOrder(next: string[]) {
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: next }),
      })
      if (!res.ok) throw new Error()
      toast.success('Guardado')
      onChanged()
    } catch {
      toast.error('No se pudo guardar el orden')
      onChanged()
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = items.indexOf(String(active.id))
    const to = items.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(items, from, to)
    setItems(next)
    persistOrder(next)
  }

  async function uploadFiles(fileList: FileList) {
    const list = Array.from(fileList)
    if (list.length === 0) return
    setUploading(true); setProgress(0)
    const t = toast.loading(`Subiendo ${list.length} foto(s)…`)
    try {
      const initRes = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'photo', files: list.map(f => ({ fileName: f.name, fileSize: f.size, contentType: f.type })) }),
      })
      const initData = await initRes.json().catch(() => ({}))
      if (!initRes.ok) { toast.error(initData?.error || 'No se pudo iniciar la subida', { id: t }); return }
      const uploads = initData.uploads as Array<{ signedUrl: string; token: string; path: string; publicUrl: string }>
      const okUrls: string[] = []
      let done = 0
      await Promise.all(uploads.map((u, i) => new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', u.signedUrl, true)
        xhr.setRequestHeader('Content-Type', list[i].type || 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', 'true')
        if (u.token) xhr.setRequestHeader('Authorization', `Bearer ${u.token}`)
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) okUrls.push(u.publicUrl)
          done++; setProgress(Math.round((done / uploads.length) * 100))
          toast.loading(`Subiendo ${done}/${uploads.length}…`, { id: t })
          resolve()
        }
        xhr.onerror = () => { done++; resolve() }
        xhr.send(list[i])
      })))
      if (okUrls.length === 0) { toast.error('No se pudo subir ninguna foto', { id: t }); return }
      const commitRes = await fetch(`/api/properties/${propertyId}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'photo', urls: okUrls }),
      })
      if (!commitRes.ok) { const d = await commitRes.json().catch(() => ({})); toast.error(d?.error || 'No se pudieron registrar las fotos', { id: t }); return }
      const failed = uploads.length - okUrls.length
      toast.success(failed > 0 ? `${okUrls.length} subidas · ${failed} fallaron` : `${okUrls.length} foto(s) subida(s)`, { id: t })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir', { id: t })
    } finally {
      setUploading(false); setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function deletePhoto(url: string) {
    if (!confirm('¿Eliminar esta foto?')) return
    const next = items.filter(u => u !== url)
    setItems(next)
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletePhoto: url }),
      })
      if (!res.ok) throw new Error()
      toast.success('Foto eliminada')
      onChanged()
    } catch {
      toast.error('No se pudo eliminar')
      onChanged()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Las 3 primeras son la portada. Arrastrá para reordenar.</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{progress > 0 ? `${progress}%` : '…'}</> : <><Upload className="h-4 w-4 mr-1" />Subir fotos</>}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay fotos subidas.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {items.map((url, i) => (
                <SortablePhoto key={url} url={url} index={i} onDelete={deletePhoto} onOpen={setLightbox} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {lightbox !== null && items[lightbox] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)} aria-label="Cerrar"><X className="h-7 w-7" /></button>
          <button className="absolute left-4 text-white text-4xl px-3" aria-label="Anterior"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + items.length) % items.length) }}>‹</button>
          <img src={items[lightbox]} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          <button className="absolute right-4 text-white text-4xl px-3" aria-label="Siguiente"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % items.length) }}>›</button>
        </div>
      )}
    </div>
  )
}
