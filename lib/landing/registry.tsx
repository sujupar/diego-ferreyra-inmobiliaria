/**
 * E1.2 — Block registry: mapea cada `type` de bloque a su render.
 *
 * Un solo lugar donde `type → componente`. El renderer (LandingRenderer) itera
 * los bloques del documento y delega acá. Cada render RESUELVE los datos duros
 * desde `property` (precio, m², fotos por índice) — el bloque sólo trae overrides.
 *
 * `ctx.mode` prepara el terreno para el editor (E1.6): hoy siempre 'public'.
 * En E1.6 cada render podrá ramificar a controles cuando mode === 'edit'.
 */
import type { ReactNode } from 'react'
import type { Database } from '@/types/database.types'
import type { LandingBlock, LandingBlockType, LandingTheme } from './schema'

import { LandingHero } from '@/components/landing/Hero'
import { LandingFeatures } from '@/components/landing/Features'
import { LandingGallery } from '@/components/landing/Gallery'
import { LandingVideoEmbed } from '@/components/landing/VideoEmbed'
import { LandingVideoFile } from '@/components/landing/VideoFile'
import { LandingTour3DEmbed } from '@/components/landing/Tour3DEmbed'
import { LandingDescription } from '@/components/landing/Description'
import { LandingLocationMap } from '@/components/landing/LocationMap'
import { LandingProofBar } from '@/components/landing/ProofBar'
import { LandingLeadForm } from '@/components/landing/LeadForm'

export type LandingProperty = Database['public']['Tables']['properties']['Row']

export interface BlockCtx {
  property: LandingProperty
  theme: LandingTheme
  mode: 'public' | 'edit'
}

export interface BlockDef {
  /** Etiqueta para la paleta del editor (E1.6). */
  label: string
  /** No borrable en el editor (el objetivo de conversión). */
  locked?: boolean
  /** Render. Devuelve null si el bloque no aplica (ej. video sin url). */
  render: (block: LandingBlock, ctx: BlockCtx) => ReactNode
}

function heroTitle(property: LandingProperty, override?: string): string {
  return override ?? property.title ?? `${property.property_type} en ${property.neighborhood}`
}

export const BLOCK_REGISTRY: Record<LandingBlockType, BlockDef> = {
  hero: {
    label: 'Portada',
    render: (block, { property }) => {
      if (block.type !== 'hero') return null
      const photos = property.photos ?? []
      const idx = block.heroPhotoIndex ?? 0
      return (
        <LandingHero
          title={heroTitle(property, block.titleOverride)}
          address={property.address}
          neighborhood={property.neighborhood}
          city={property.city}
          price={property.asking_price}
          currency={property.currency}
          operationType={property.operation_type}
          heroImage={photos[idx] ?? photos[0]}
        />
      )
    },
  },

  proof_bar: {
    label: 'Prueba social',
    render: (block) => {
      if (block.type !== 'proof_bar') return null
      return <LandingProofBar items={block.items} />
    },
  },

  features: {
    label: 'Características',
    render: (block, { property }) => {
      if (block.type !== 'features') return null
      return (
        <LandingFeatures
          rooms={property.rooms}
          bedrooms={property.bedrooms}
          bathrooms={property.bathrooms}
          garages={property.garages}
          coveredArea={property.covered_area}
          totalArea={property.total_area}
          floor={property.floor}
          age={property.age}
          expensas={property.expensas}
          amenities={Array.isArray(property.amenities) ? (property.amenities as string[]) : []}
        />
      )
    },
  },

  gallery: {
    label: 'Galería',
    render: (block, { property }) => {
      if (block.type !== 'gallery') return null
      const all = property.photos ?? []
      if (all.length === 0) return null
      const photos = block.photoIndices?.length
        ? block.photoIndices.map(i => all[i]).filter((p): p is string => typeof p === 'string')
        : all
      if (photos.length === 0) return null
      return <LandingGallery photos={photos} />
    },
  },

  video_embed: {
    label: 'Video (enlace)',
    render: (block, { property }) => {
      if (block.type !== 'video_embed') return null
      if (!property.video_url) return null
      return <LandingVideoEmbed url={property.video_url} />
    },
  },

  video_file: {
    label: 'Video (archivo)',
    render: (block, { property }) => {
      if (block.type !== 'video_file') return null
      if (!property.video_file_url) return null
      return <LandingVideoFile url={property.video_file_url} poster={property.photos?.[0]} />
    },
  },

  tour_3d: {
    label: 'Recorrido 3D',
    render: (block, { property }) => {
      if (block.type !== 'tour_3d') return null
      if (!property.tour_3d_url) return null
      return <LandingTour3DEmbed url={property.tour_3d_url} />
    },
  },

  description: {
    label: 'Descripción',
    render: (block, { property }) => {
      if (block.type !== 'description') return null
      const text = block.textOverride ?? property.description
      if (!text) return null
      return <LandingDescription text={text} />
    },
  },

  location_map: {
    label: 'Ubicación',
    render: (block, { property }) => {
      if (block.type !== 'location_map') return null
      if (property.latitude == null || property.longitude == null) return null
      return <LandingLocationMap lat={property.latitude} lng={property.longitude} address={property.address} />
    },
  },

  lead_form: {
    label: 'Formulario',
    locked: true,
    render: (block, { property }) => {
      if (block.type !== 'lead_form') return null
      return (
        <LandingLeadForm
          propertyId={property.id}
          propertyTitle={heroTitle(property)}
        />
      )
    },
  },
}
