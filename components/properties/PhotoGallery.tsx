'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, X, GripVertical, Camera } from 'lucide-react'
import { useSubirFotos } from '@/lib/properties/use-subir-fotos'
import { useDeslizarFotos } from '@/lib/properties/deslizar-fotos'

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
      {/*
        SIEMPRE VISIBLE en táctil. Antes era `opacity-0 group-hover:opacity-100`:
        en un teléfono no existe `:hover`, así que el botón no aparecía nunca —
        pero seguía recibiendo toques, porque `opacity: 0` no desactiva nada. O
        sea: había un botón de borrar INVISIBLE en la esquina de cada foto.
        En escritorio se conserva el comportamiento de siempre.
      */}
      <button type="button" onClick={() => onDelete(url)} aria-label={`Eliminar foto ${index + 1}`}
        className="absolute top-1.5 right-1.5 h-6 w-6 max-md:h-11 max-md:w-11 rounded-full bg-black/60 text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
        <X className="h-3.5 w-3.5 max-md:h-5 max-md:w-5" />
      </button>
      {/*
        El asa se va a la esquina OPUESTA en el teléfono: con los dos controles a
        44px en la misma columna derecha, sobre una miniatura de ~103px de alto a
        320px, quedaban pegados y borrar/reordenar se confundían con el pulgar.

        `touch-none` solo en escritorio: con el `TouchSensor` por pulsación larga,
        bloquear el gesto acá haría que la página no scrollee cuando el dedo cae
        sobre el asa — y con una foto de cada dos llevando asa, eso es media
        pantalla muerta. Durante la espera de 200ms el navegador scrollea normal
        y ese mismo movimiento cancela el arrastre.
      */}
      <button type="button" {...attributes} {...listeners} aria-label={`Reordenar foto ${index + 1}`}
        className="absolute bottom-1.5 right-1.5 max-md:left-1.5 max-md:right-auto h-6 w-6 max-md:h-11 max-md:w-11 rounded-full bg-black/40 text-white flex items-center justify-center cursor-grab touch-none max-md:touch-auto">
        <GripVertical className="h-3.5 w-3.5 max-md:h-5 max-md:w-5" />
      </button>
    </div>
  )
}

export function PhotoGallery({ propertyId, photos, onChanged }: Props) {
  const [items, setItems] = useState<string[]>(photos)
  const [lightbox, setLightbox] = useState<number | null>(null)
  // La subida salió a `useSubirFotos` para que la cabecera de la ficha pueda
  // ofrecerla sin depender de que esta pestaña esté montada. Acá se usa una
  // instancia propia: mismo comportamiento que antes, cero cambios visibles.
  const subida = useSubirFotos(propertyId, onChanged)
  /*
    Un sensor POR ENTRADA, y no el `PointerSensor` de antes, que los unifica.
    Motivo: el pointer también dispara con el dedo, y con `distance: 6` el
    arrastre arrancaba a los 6px de movimiento — o sea que cualquier intento de
    scrollear con el dedo apoyado en el asa reordenaba las fotos, que es
    reordenar la PORTADA del aviso, sin que nadie lo pidiera.

    Con el dedo hace falta mantener presionado 200ms; si en esa espera el dedo se
    mueve más de 6px, se entiende que quiso scrollear y no se arrastra nada. El
    mouse conserva el gesto de siempre.

    OJO: `PointerSensor` + `TouchSensor` juntos NO sirven — el pointer se activa
    primero y el retardo del táctil nunca llega a contar.
  */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )
  const gestos = useDeslizarFotos(
    () => setLightbox(i => (i === null ? i : (i - 1 + items.length) % items.length)),
    () => setLightbox(i => (i === null ? i : (i + 1) % items.length)),
  )

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
      <div className="flex items-center justify-between gap-2 max-md:flex-wrap">
        <p className="text-xs text-muted-foreground">
          Las 3 primeras son la portada. Para reordenarlas, arrastrá desde el asa
          (en el teléfono, mantenela presionada un segundo).
        </p>
        <input {...subida.inputProps} />
        <input {...subida.inputPropsCamara} />
        <div className="flex items-center gap-2 max-md:w-full">
          {/*
            Solo en el teléfono: `capture` en una notebook abre el mismo diálogo
            de archivos que el botón de al lado, o la webcam — ninguna de las dos
            cosas sirve para fotografiar una propiedad.
          */}
          <Button size="sm" variant="outline" className="md:hidden max-md:flex-1" onClick={subida.abrirCamara} disabled={subida.subiendo}>
            <Camera className="h-4 w-4 mr-1" />Sacar foto
          </Button>
          <Button size="sm" variant="outline" className="max-md:flex-1" onClick={subida.abrirSelector} disabled={subida.subiendo}>
            {subida.subiendo ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{subida.progreso > 0 ? `${subida.progreso}%` : '…'}</> : <><Upload className="h-4 w-4 mr-1" />Subir fotos</>}
          </Button>
        </div>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fotos de la propiedad"
          data-testid="visor-fotos"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          /* El deslizamiento termina emitiendo un clic sintético: sin esta
             pregunta, pasar de foto con el dedo cerraba el visor en el mismo
             gesto. Con mouse la respuesta siempre es `false`. */
          onClick={() => { if (gestos.absorbioElToque()) return; setLightbox(null) }}
          onTouchStart={gestos.onTouchStart}
          onTouchEnd={gestos.onTouchEnd}
        >
          <button className="absolute top-4 right-4 text-white tap flex items-center justify-center" onClick={() => setLightbox(null)} aria-label="Cerrar"><X className="h-7 w-7" /></button>
          <button className="absolute left-4 text-white text-4xl tap flex items-center justify-center" aria-label="Foto anterior"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + items.length) % items.length) }}>‹</button>
          {/* `dvh` y no `vh`: en iOS `vh` mide el viewport GRANDE (el de la barra
              de direcciones escondida), así que la foto se dibujaba más alta que
              la pantalla y se le iban los bordes de cuadro. */}
          <img src={items[lightbox]} alt={`Foto ${lightbox + 1} de ${items.length}`} className="max-h-[90dvh] max-w-[90vw] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          <button className="absolute right-4 text-white text-4xl tap flex items-center justify-center" aria-label="Foto siguiente"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % items.length) }}>›</button>
          <span className="absolute bottom-5 text-white/80 text-sm tabular-n">{lightbox + 1} / {items.length}</span>
        </div>
      )}
    </div>
  )
}
