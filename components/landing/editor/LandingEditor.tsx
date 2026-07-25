'use client'
/**
 * E1.6 Editor — shell de 2 paneles. Izquierda: EditorPreview (landing real). Derecha:
 * toggles de secciones + panel de la sección seleccionada. Estado del documento +
 * autosave a borrador + "Publicar cambios". La estructura de lujo queda fija: sólo se
 * editan campos de contenido y se muestran/ocultan 3 secciones opcionales.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorPreview } from './EditorPreview'
import { EditorPanel } from './EditorPanel'
import { SectionToggles } from './SectionToggles'
import { useAutosave } from './useAutosave'
import { replaceBlockById } from '@/lib/landing/editor/block-patch'
import { insertBlockInCuratedOrder, removeBlockById } from '@/lib/landing/editor/block-order'
import { defaultOptionalBlock } from '@/lib/landing/editor/editable'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingBlock, LandingDocument } from '@/lib/landing/schema'

interface LandingEditorProps {
  propertyId: string
  property: LandingProperty
  initialDocument: LandingDocument
  isPublished: boolean
  publicSlug: string | null
}

export function LandingEditor({ propertyId, property, initialDocument, isPublished, publicSlug }: LandingEditorProps) {
  const router = useRouter()
  const [doc, setDoc] = useState<LandingDocument>(initialDocument)
  const [selectedId, setSelectedId] = useState<string | null>('hero')
  const [publishing, setPublishing] = useState(false)
  const hiddenRef = useRef<Record<string, LandingBlock>>({})
  const { status, flush } = useAutosave(propertyId, doc)

  const selectedBlock = doc.blocks.find((b) => b.id === selectedId) ?? null

  function handleBlockChange(next: LandingBlock) {
    setDoc((d) => ({ ...d, blocks: replaceBlockById(d.blocks, next.id, next) }))
  }

  function handleToggle(id: string, on: boolean) {
    setDoc((d) => {
      if (on) {
        const block = hiddenRef.current[id] ?? defaultOptionalBlock(id, property)
        if (!block) return d
        delete hiddenRef.current[id]
        return { ...d, blocks: insertBlockInCuratedOrder(d.blocks, block) }
      }
      const found = d.blocks.find((b) => b.id === id)
      if (found) hiddenRef.current[id] = found // recordamos lo editado por si lo vuelve a mostrar
      if (selectedId === id) setSelectedId('hero')
      return { ...d, blocks: removeBlockById(d.blocks, id) }
    })
  }

  async function publish() {
    setPublishing(true)
    try {
      await flush() // asegura que el último cambio quedó en el borrador
      const res = await fetch(`/api/properties/${propertyId}/landing/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudo publicar')
      toast.success('Cambios publicados')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar')
    } finally {
      setPublishing(false)
    }
  }

  const saveLabel =
    status === 'saving' ? 'Guardando…' : status === 'error' ? 'Error al guardar' : status === 'saved' ? 'Guardado' : ''

  return (
    // Pantalla completa por encima del chrome del dashboard (sidebar/header); "Volver" lo cierra.
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/properties/${propertyId}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Volver
          </Button>
          <span className="text-sm font-medium">Editar landing</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === 'saved' && <Check className="h-3 w-3 text-emerald-600" />}
            {saveLabel}
          </span>
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />}
            {isPublished ? 'Publicar cambios' : 'Publicar landing'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Vista previa (scrollea) */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <EditorPreview document={doc} property={property} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        {/* Panel de edición */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-background p-4 md:w-[380px] md:border-l md:border-t-0">
          <SectionToggles doc={doc} property={property} onToggle={handleToggle} />
          {selectedBlock ? (
            <EditorPanel block={selectedBlock} property={property} onChange={handleBlockChange} />
          ) : (
            <p className="text-sm text-muted-foreground">Tocá una sección en la vista previa para editarla.</p>
          )}
          {publicSlug && (
            <a href={`/p/${publicSlug}`} target="_blank" rel="noopener noreferrer"
              className="inline-block text-xs text-emerald-700 underline">
              Ver landing publicada
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}
