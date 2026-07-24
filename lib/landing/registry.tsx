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

import { LandingFeatures } from '@/components/landing/Features'
import { LandingGallery } from '@/components/landing/Gallery'
import { LandingVideoEmbed } from '@/components/landing/VideoEmbed'
import { LandingVideoFile } from '@/components/landing/VideoFile'
import { LandingTour3DEmbed } from '@/components/landing/Tour3DEmbed'
import { LandingDescription } from '@/components/landing/Description'
import { LandingLocationMap } from '@/components/landing/LocationMap'
import { LandingProofBar } from '@/components/landing/ProofBar'
import { LandingLeadForm } from '@/components/landing/LeadForm'
// E1.8 — conversión
import { LandingIntangibleBenefits } from '@/components/landing/IntangibleBenefits'
import { LandingBenefitShowcase } from '@/components/landing/BenefitShowcase'
import { LandingStory } from '@/components/landing/Story'
import { LandingMainBenefit } from '@/components/landing/MainBenefit'
import { LandingEssentialSpecs } from '@/components/landing/EssentialSpecs'
import { LandingLocationNote } from '@/components/landing/LocationNote'
import { LandingCtaBand } from '@/components/landing/CtaBand'
// E1.9 — lujo
import { HeroLuxury } from '@/components/landing/luxury/HeroLuxury'
import { StatsBar } from '@/components/landing/luxury/StatsBar'
import { ClosingInvite } from '@/components/landing/luxury/ClosingInvite'
import { FooterBrand } from '@/components/landing/luxury/FooterBrand'
import { StoryBlocks } from '@/components/landing/luxury/StoryBlocks'
import { CuratedGallery } from '@/components/landing/luxury/CuratedGallery'
import { LocationShowcase } from '@/components/landing/luxury/LocationShowcase'

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

/** Datos clave (3-4) para la oferta del hero. Solo los presentes. */
function buildSpecs(property: LandingProperty): string[] {
  const s: string[] = []
  if (property.rooms) s.push(`${property.rooms} amb`)
  if (property.bedrooms) s.push(`${property.bedrooms} dorm`)
  if (property.covered_area) s.push(`${property.covered_area} m²`)
  if (property.garages) s.push(`${property.garages} coch`)
  return s.slice(0, 4)
}

export const BLOCK_REGISTRY: Record<LandingBlockType, BlockDef> = {
  hero: {
    label: 'Portada',
    render: (block, { property }) => {
      if (block.type !== 'hero') return null
      const photos = property.photos ?? []
      const idx = block.heroPhotoIndex ?? 0
      return (
        <HeroLuxury
          title={heroTitle(property, block.titleOverride)}
          subtitle={block.subtitle}
          offerLabel={block.offerLabel}
          ctaLabel={block.ctaLabel}
          neighborhood={property.neighborhood}
          city={property.city}
          price={property.asking_price}
          currency={property.currency}
          operationType={property.operation_type}
          specs={buildSpecs(property)}
          heroImage={photos[idx] ?? photos[0]}
          videoUrl={property.video_url}
          videoFileUrl={property.video_file_url}
          mediaMode={block.mediaMode}
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

  // ── E1.8 · Bloques de conversión ──────────────────────────────────────────
  intangible_benefits: {
    label: 'Beneficios',
    render: (block) => {
      if (block.type !== 'intangible_benefits') return null
      return <LandingIntangibleBenefits eyebrow={block.eyebrow} items={block.items} />
    },
  },

  benefit_showcase: {
    label: 'Showcase',
    render: (block, { property }) => {
      if (block.type !== 'benefit_showcase') return null
      const all = property.photos ?? []
      const photos = block.photoIndices?.length
        ? block.photoIndices.map(i => all[i]).filter((p): p is string => typeof p === 'string')
        : all.slice(0, 4)
      return <LandingBenefitShowcase headline={block.headline} body={block.body} photos={photos} />
    },
  },

  story: {
    label: 'Storytelling',
    render: (block, { property }) => {
      if (block.type !== 'story') return null
      const body = block.body ?? property.description ?? ''
      if (!body.trim()) return null
      return <LandingStory title={block.title ?? 'Sobre esta propiedad'} body={body} />
    },
  },

  main_benefit: {
    label: 'Beneficio principal',
    render: (block) => {
      if (block.type !== 'main_benefit') return null
      return <LandingMainBenefit headline={block.headline} body={block.body} />
    },
  },

  essential_specs: {
    label: 'Datos esenciales',
    render: (block, { property }) => {
      if (block.type !== 'essential_specs') return null
      return (
        <LandingEssentialSpecs
          rooms={property.rooms}
          bedrooms={property.bedrooms}
          bathrooms={property.bathrooms}
          garages={property.garages}
          coveredArea={property.covered_area}
        />
      )
    },
  },

  location_note: {
    label: 'Ubicación',
    render: (block, { property }) => {
      if (block.type !== 'location_note') return null
      return (
        <LandingLocationNote
          neighborhood={property.neighborhood}
          city={property.city}
          note={block.text}
        />
      )
    },
  },

  cta: {
    label: 'CTA',
    render: (block) => {
      if (block.type !== 'cta') return null
      return (
        <LandingCtaBand
          label={block.label ?? 'Quiero saber más'}
          headline={block.headline}
          subtext={block.subtext}
          source={block.id}
        />
      )
    },
  },

  // ── E1.9 · Bloques de la plantilla de lujo ────────────────────────────────
  stats_bar: {
    label: 'Datos',
    render: (block, { property }) => {
      if (block.type !== 'stats_bar') return null
      return (
        <StatsBar
          rooms={property.rooms}
          bedrooms={property.bedrooms}
          bathrooms={property.bathrooms}
          garages={property.garages}
          coveredArea={property.covered_area}
          totalArea={property.total_area}
          floor={property.floor}
          age={property.age}
          expensas={property.expensas}
        />
      )
    },
  },
  closing_invite: {
    label: 'Cierre',
    render: (block) => {
      if (block.type !== 'closing_invite') return null
      return (
        <ClosingInvite
          eyebrow={block.eyebrow}
          headline={block.headline}
          body={block.body}
          ctaLabel={block.ctaLabel}
          source={block.id}
        />
      )
    },
  },
  footer_brand: {
    label: 'Footer',
    render: (block) => {
      if (block.type !== 'footer_brand') return null
      return <FooterBrand />
    },
  },
  story_blocks: {
    label: 'Historia',
    render: (block, { property }) => {
      if (block.type !== 'story_blocks') return null
      const photos = property.photos ?? []
      const items = block.items.map(it => ({
        numeral: it.numeral,
        eyebrow: it.eyebrow,
        headline: it.headline,
        body: it.body,
        photo: it.photoIndex != null ? photos[it.photoIndex] : undefined,
      }))
      return <StoryBlocks items={items} />
    },
  },
  curated_gallery: {
    label: 'Galería',
    render: (block, { property }) => {
      if (block.type !== 'curated_gallery') return null
      const all = property.photos ?? []
      const photos = block.photoIndices?.length
        ? block.photoIndices.map(i => all[i]).filter((p): p is string => typeof p === 'string')
        : all
      return <CuratedGallery photos={photos} eyebrow={block.eyebrow} title={block.title} />
    },
  },
  location_showcase: {
    label: 'Ubicación',
    render: (block, { property }) => {
      if (block.type !== 'location_showcase') return null
      const photos = property.photos ?? []
      const image = block.photoIndex != null ? photos[block.photoIndex] : undefined
      return (
        <LocationShowcase
          neighborhood={property.neighborhood}
          city={property.city}
          eyebrow={block.eyebrow}
          title={block.title}
          body={block.body}
          image={image}
        />
      )
    },
  },
  // Stub (null) hasta F3.
  floor_plans: { label: 'Planos', render: () => null },
}
