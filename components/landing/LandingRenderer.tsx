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
import { Reveal } from '@/components/landing/Reveal'

interface LandingRendererProps {
  document: LandingDocument
  property: LandingProperty
  mode?: 'public' | 'edit'
}

export function LandingRenderer({ document, property, mode = 'public' }: LandingRendererProps) {
  const ctx = { property, theme: document.theme ?? {}, mode }
  const motionOn = mode === 'public' && (document.theme?.motion ?? 'on') !== 'off'
  return (
    <>
      {document.blocks.map(block => {
        const def = BLOCK_REGISTRY[block.type]
        if (!def) return null
        const node = def.render(block, ctx)
        if (node == null) return null
        // El hero anima su propia entrada; los bloques de lujo se auto-animan
        // (selfAnimates → clase lx-reveal propia, no doble-envolver). El resto
        // aparece al hacer scroll vía Reveal (salvo motion off o editor).
        if (block.type === 'hero' || def.selfAnimates || !motionOn) {
          return <Fragment key={block.id}>{node}</Fragment>
        }
        return <Reveal key={block.id}>{node}</Reveal>
      })}
    </>
  )
}
