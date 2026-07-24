/**
 * E1.2 — Renderer schema-driven de la landing.
 *
 * Recibe el `LandingDocument` (bloques ordenados) + la propiedad, y renderiza
 * cada bloque vía el BLOCK_REGISTRY. Es el mismo motor para la landing pública
 * (mode='public') y, en E1.6, para el editor (mode='edit').
 *
 * Server-render friendly: no usa estado de cliente. Los bloques interactivos
 * (LeadForm, VideoFile) son client components internamente.
 */
import { Fragment } from 'react'
import type { LandingDocument } from '@/lib/landing/schema'
import { BLOCK_REGISTRY, type LandingProperty } from '@/lib/landing/registry'

interface LandingRendererProps {
  document: LandingDocument
  property: LandingProperty
  mode?: 'public' | 'edit'
}

export function LandingRenderer({ document, property, mode = 'public' }: LandingRendererProps) {
  const ctx = { property, theme: document.theme ?? {}, mode }
  return (
    <>
      {document.blocks.map(block => {
        const def = BLOCK_REGISTRY[block.type]
        if (!def) return null
        return <Fragment key={block.id}>{def.render(block, ctx)}</Fragment>
      })}
    </>
  )
}
