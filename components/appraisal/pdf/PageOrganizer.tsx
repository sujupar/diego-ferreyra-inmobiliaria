'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    arrayMove,
    rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, RotateCcw, Loader2 } from 'lucide-react'

export interface PageLayoutState {
    order: number[]
    hidden: number[]
    pageCount: number
}

interface PageOrganizerProps {
    /** Bytes del PDF renderizado (fuente de las miniaturas y de los índices). */
    pdfBytes: ArrayBuffer
    /** Layout guardado en la propiedad. Se aplica SOLO si su `pageCount` coincide con
     *  el PDF actual (misma estructura); si no, se usa el orden por defecto. */
    savedLayout?: { order: number[]; hidden: number[]; pageCount: number } | null
    /** Reporta el layout actual al padre (para descargar / guardar). */
    onLayoutChange: (layout: PageLayoutState) => void
}

function SortableThumb({
    id,
    thumb,
    pageNum,
    hidden,
    onToggleHidden,
}: {
    id: number
    thumb: string | undefined
    pageNum: number
    hidden: boolean
    onToggleHidden: (id: number) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    }
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative rounded-lg border bg-background shadow-sm ${isDragging ? 'z-10 ring-2 ring-primary' : ''}`}
        >
            <button
                type="button"
                onClick={() => onToggleHidden(id)}
                className={`absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-white shadow ${hidden ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'}`}
                title={hidden ? 'Restaurar página' : 'Quitar página'}
            >
                {hidden ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </button>
            <div
                {...attributes}
                {...listeners}
                className={`cursor-grab active:cursor-grabbing select-none p-1.5 ${hidden ? 'opacity-30 grayscale' : ''}`}
            >
                {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={`Página ${pageNum}`} className="w-full rounded border" draggable={false} />
                ) : (
                    <div className="flex aspect-[1/1.414] w-full items-center justify-center rounded border bg-muted">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                )}
                <div className="pt-1 text-center text-[11px] text-muted-foreground">
                    {hidden ? <span className="line-through">Pág {pageNum}</span> : <span>Pág {pageNum}</span>}
                </div>
            </div>
        </div>
    )
}

export function PageOrganizer({ pdfBytes, savedLayout, onLayoutChange }: PageOrganizerProps) {
    const [thumbs, setThumbs] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [order, setOrder] = useState<number[]>([])
    const [hidden, setHidden] = useState<Set<number>>(new Set())
    const pageCountRef = useRef(0)
    // savedLayout se lee por ref SOLO para inicializar el orden la primera vez: así
    // re-guardar el layout (que cambia la identidad de savedLayout) NO regenera las
    // miniaturas. El efecto depende únicamente de pdfBytes.
    const savedLayoutRef = useRef(savedLayout)
    savedLayoutRef.current = savedLayout

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    // Render thumbnails con pdfjs (cliente). Worker servido como estático desde /public.
    useEffect(() => {
        const savedLayout = savedLayoutRef.current
        let cancelled = false
        setLoading(true)
        setThumbs([])
        ;(async () => {
            try {
                const pdfjs = await import('pdfjs-dist')
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
                // Clonar: pdfjs puede transferir/detachar el ArrayBuffer al worker, y esos
                // bytes los seguimos necesitando para la descarga.
                const data = pdfBytes.slice(0)
                const doc = await pdfjs.getDocument({ data }).promise
                if (cancelled) return
                const n = doc.numPages
                pageCountRef.current = n

                // Inicializar orden/hidden desde el layout guardado SOLO si su pageCount
                // coincide (misma estructura); si no, orden por defecto.
                const applySaved = savedLayout && savedLayout.pageCount === n
                const validInitial = applySaved ? savedLayout!.order.filter(i => i >= 0 && i < n) : []
                const initOrder = validInitial.length > 0
                    ? (() => {
                        const seen = new Set(validInitial)
                        const full = [...validInitial]
                        for (let i = 0; i < n; i++) if (!seen.has(i)) full.push(i)
                        return full
                    })()
                    : Array.from({ length: n }, (_, i) => i)
                const initHidden = new Set(applySaved ? savedLayout!.hidden.filter(i => i >= 0 && i < n) : [])
                setOrder(initOrder)
                setHidden(initHidden)

                const urls: string[] = new Array(n)
                for (let p = 1; p <= n; p++) {
                    const page = await doc.getPage(p)
                    const viewport = page.getViewport({ scale: 0.45 })
                    const canvas = document.createElement('canvas')
                    canvas.width = Math.ceil(viewport.width)
                    canvas.height = Math.ceil(viewport.height)
                    const ctx = canvas.getContext('2d')
                    if (!ctx) continue
                    await page.render({ canvas, canvasContext: ctx, viewport }).promise
                    if (cancelled) return
                    urls[p - 1] = canvas.toDataURL('image/jpeg', 0.72)
                    setThumbs(prev => {
                        const next = prev.length === n ? [...prev] : new Array(n)
                        next[p - 1] = urls[p - 1]
                        return next
                    })
                }
                if (!cancelled) setLoading(false)
            } catch (err) {
                console.error('[PageOrganizer] error renderizando miniaturas', err)
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [pdfBytes])

    // Reportar layout al padre cada vez que cambia.
    useEffect(() => {
        if (pageCountRef.current === 0) return
        onLayoutChange({ order, hidden: [...hidden], pageCount: pageCountRef.current })
    }, [order, hidden, onLayoutChange])

    const handleDragEnd = useCallback((e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        setOrder(prev => {
            const oldIndex = prev.indexOf(active.id as number)
            const newIndex = prev.indexOf(over.id as number)
            if (oldIndex === -1 || newIndex === -1) return prev
            return arrayMove(prev, oldIndex, newIndex)
        })
    }, [])

    const toggleHidden = useCallback((id: number) => {
        setHidden(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const reset = useCallback(() => {
        const n = pageCountRef.current
        setOrder(Array.from({ length: n }, (_, i) => i))
        setHidden(new Set())
    }, [])

    const visibleCount = order.filter(i => !hidden.has(i)).length

    return (
        <div className="mx-auto max-w-5xl p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold">Organizar páginas</h3>
                    <p className="text-xs text-muted-foreground">
                        Arrastrá para reordenar · tocá la X para quitar una página · {visibleCount} de {order.length} páginas se incluirán.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restablecer
                </button>
            </div>

            {loading && thumbs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Generando miniaturas…</p>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={order} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
                            {order.map(idx => (
                                <SortableThumb
                                    key={idx}
                                    id={idx}
                                    thumb={thumbs[idx]}
                                    pageNum={idx + 1}
                                    hidden={hidden.has(idx)}
                                    onToggleHidden={toggleHidden}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    )
}
