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
import { ThanksPreview } from './ThanksPreview'
import { ThanksPanel } from './panels/ThanksPanel'
import { resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { useAutosave } from './useAutosave'
import { replaceBlockById } from '@/lib/landing/editor/block-patch'
import { insertBlockInCuratedOrder, removeBlockById } from '@/lib/landing/editor/block-order'
import { defaultOptionalBlock } from '@/lib/landing/editor/editable'
import { leerBloqueOculto, olvidarBloqueOculto, recordarBloqueOculto } from '@/lib/landing/editor/hidden-blocks'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingBlock, LandingDocument, ThanksContent } from '@/lib/landing/schema'

/**
 * Qué página se está editando. La landing y la página de gracias viven en el
 * MISMO documento (`doc.blocks` y `doc.thanks`), así que el autosave y el
 * "Publicar cambios" ya cubren las dos sin ningún flujo nuevo — solo cambia
 * qué se muestra.
 */
type EditingPage = 'landing' | 'thanks'

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
  const [page, setPage] = useState<EditingPage>('landing')
  const [publishing, setPublishing] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const hiddenRef = useRef<Record<string, LandingBlock>>({})
  const { status, flush } = useAutosave(propertyId, doc)

  const selectedBlock = doc.blocks.find((b) => b.id === selectedId) ?? null

  function handleThanksChange(next: ThanksContent) {
    setDoc((d) => ({ ...d, thanks: next }))
  }

  function handleBlockChange(next: LandingBlock) {
    setDoc((d) => ({ ...d, blocks: replaceBlockById(d.blocks, next.id, next) }))
  }

  // Los efectos (mutar hiddenRef, mover la selección) van FUERA del updater de setDoc:
  // React 19 doble-invoca los updaters en StrictMode y un updater impuro perdería lo
  // editado al re-mostrar una sección. El updater queda puro (solo transforma blocks).
  //
  // El `hiddenRef` solo cubre la sesión actual. Lo ocultado se recuerda TAMBIÉN en
  // el navegador (`hidden-blocks.ts`): sin eso, ocultar "Ubicación", salir del
  // editor y volver a prenderla devolvía un bloque vacío y el texto de zona que
  // había escrito la IA no se podía recuperar de ningún lado.
  function handleToggle(id: string, on: boolean) {
    if (on) {
      const block = hiddenRef.current[id] ?? leerBloqueOculto(propertyId, id) ?? defaultOptionalBlock(id, property)
      if (!block) return
      delete hiddenRef.current[id]
      olvidarBloqueOculto(propertyId, id)
      setDoc((d) => ({ ...d, blocks: insertBlockInCuratedOrder(d.blocks, block) }))
    } else {
      const found = doc.blocks.find((b) => b.id === id)
      if (found) {
        hiddenRef.current[id] = found // recordamos lo editado por si lo vuelve a mostrar
        recordarBloqueOculto(propertyId, found)
      }
      if (selectedId === id) setSelectedId('hero')
      setDoc((d) => ({ ...d, blocks: removeBlockById(d.blocks, id) }))
    }
  }

  /**
   * "Volver" guarda lo pendiente ANTES de irse.
   *
   * El autosave espera 800ms desde la última tecla. Si el asesor terminaba de
   * escribir y tocaba "Volver" enseguida, el desmontaje cancelaba ese timer y lo
   * último tipeado se perdía sin ningún aviso — con el cartel diciendo "Guardado"
   * (de la tanda anterior). Ahora se fuerza el guardado y, si no se pudo, se
   * pregunta en vez de perderlo en silencio.
   */
  async function volver() {
    setSaliendo(true)
    try {
      const savedOk = await flush()
      if (!savedOk && !confirm('No se pudo guardar el último cambio. ¿Salir igual y perderlo?')) return
      router.push(`/properties/${propertyId}`)
    } finally {
      setSaliendo(false)
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      // Si el guardado del borrador falló (500/red), NO publicamos: promoveríamos un
      // borrador viejo/nulo y mostraríamos "publicado" habiendo perdido la última edición.
      const savedOk = await flush()
      if (!savedOk) {
        toast.error('No se pudo guardar el último cambio. Revisá tu conexión y reintentá.')
        return
      }
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
          <Button variant="ghost" size="sm" onClick={volver} disabled={saliendo}>
            {saliendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-1 h-4 w-4" />}
            Volver
          </Button>
          <span className="text-sm font-medium">Editar</span>
          {/* Selector de página. Las dos se guardan y se publican juntas. */}
          <div className="flex rounded-md border p-0.5">
            {([
              ['landing', 'Página principal'],
              ['thanks', 'Página de gracias'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                aria-pressed={page === id}
                className={
                  page === id
                    ? 'rounded px-3 py-1 text-xs font-medium bg-primary text-primary-foreground'
                    : 'rounded px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
                }
              >
                {label}
              </button>
            ))}
          </div>
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
          {page === 'landing' ? (
            <EditorPreview document={doc} property={property} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <ThanksPreview property={property} thanks={doc.thanks ?? {}} />
          )}
        </div>
        {/* Panel de edición */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-background p-4 md:w-[380px] md:border-l md:border-t-0">
          {page === 'landing' ? (
            <>
              <SectionToggles doc={doc} property={property} onToggle={handleToggle} />
              {selectedBlock ? (
                <EditorPanel block={selectedBlock} property={property} onChange={handleBlockChange} />
              ) : (
                <p className="text-sm text-muted-foreground">Tocá una sección en la vista previa para editarla.</p>
              )}
            </>
          ) : (
            <ThanksPanel
              value={doc.thanks ?? {}}
              subject={{ address: property.address, mediaKind: resolveDeliverMedia(property).kind }}
              onChange={handleThanksChange}
            />
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
