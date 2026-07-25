'use client'
/**
 * E1.6 Editor — vista previa en vivo. Itera los bloques del documento con el MISMO
 * BLOCK_REGISTRY que la landing pública (mode='edit'), pero envuelve cada bloque en
 * un overlay clickeable que lo SELECCIONA (y captura los clics para que los CTAs
 * internos no se disparen mientras se edita). Sin animaciones (clase lx-editor-preview).
 */
import { BLOCK_REGISTRY, type LandingProperty } from '@/lib/landing/registry'
import type { LandingDocument } from '@/lib/landing/schema'
import { LeadCaptureProvider } from '@/components/landing/LeadCaptureProvider'

interface EditorPreviewProps {
  document: LandingDocument
  property: LandingProperty
  selectedId: string | null
  onSelect: (id: string) => void
}

export function EditorPreview({ document, property, selectedId, onSelect }: EditorPreviewProps) {
  const ctx = { property, theme: document.theme ?? {}, mode: 'edit' as const }
  const title = property.title ?? `${property.property_type} en ${property.neighborhood}`
  return (
    <div className="landing-root lx-editor-preview">
      <LeadCaptureProvider propertyId={property.id} propertyTitle={title}>
        {document.blocks.map((block) => {
          const def = BLOCK_REGISTRY[block.type]
          if (!def) return null
          const node = def.render(block, ctx)
          const selected = selectedId === block.id
          return (
            <div key={block.id} className="relative" data-block-id={block.id}>
              {node ?? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Sección «{def.label}» (sin datos para mostrar)
                </div>
              )}
              {/* Captura TODOS los clics del bloque → seleccionar (bloquea CTAs internos). */}
              <button
                type="button"
                onClick={() => onSelect(block.id)}
                aria-label={`Editar sección ${def.label}`}
                className="absolute inset-0 z-10 cursor-pointer"
              />
              {selected && (
                <div className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-[color:var(--brand)]" />
              )}
            </div>
          )
        })}
      </LeadCaptureProvider>
    </div>
  )
}
