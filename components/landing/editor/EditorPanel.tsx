'use client'
/**
 * E1.6 Editor — despacha el bloque seleccionado a su panel de edición. La estructura
 * de lujo es fija: sólo se editan campos de contenido. Bloques sin campos → InfoPanel.
 */
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { InfoPanel } from './panels/InfoPanel'
import { HeroPanel } from './panels/HeroPanel'
import { StoryBlocksPanel } from './panels/StoryBlocksPanel'
import { CuratedGalleryPanel } from './panels/CuratedGalleryPanel'
import { LocationPanel } from './panels/LocationPanel'
import { ClosingPanel } from './panels/ClosingPanel'

interface EditorPanelProps {
  block: LandingBlock
  property: LandingProperty
  onChange: (next: LandingBlock) => void
}

export function EditorPanel({ block, property, onChange }: EditorPanelProps) {
  switch (block.type) {
    case 'hero':
      return <HeroPanel block={block} property={property} onChange={onChange} />
    case 'story_blocks':
      return <StoryBlocksPanel block={block} property={property} onChange={onChange} />
    case 'curated_gallery':
      return <CuratedGalleryPanel block={block} property={property} onChange={onChange} />
    case 'location_showcase':
      return <LocationPanel block={block} onChange={onChange} />
    case 'closing_invite':
      return <ClosingPanel block={block} onChange={onChange} />
    case 'stats_bar':
      return <InfoPanel title="Datos" text="Esta franja se arma sola con los datos de la propiedad (ambientes, dormitorios, superficie). No necesita edición." />
    case 'floor_plans':
      return <InfoPanel title="Planos" text="Los planos se toman de los archivos cargados en la sección Multimedia de la propiedad." />
    case 'footer_brand':
      return <InfoPanel title="Pie" text="El pie muestra la marca Diego Ferreyra y la matrícula CUCICBA. No necesita edición." />
    default:
      return <InfoPanel title="Sección" text="Esta sección no tiene campos editables." />
  }
}
