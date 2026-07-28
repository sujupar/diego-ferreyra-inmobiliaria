/**
 * E1.9 — Template "Lujo" (default). Arma el LandingDocument en el orden curado
 * de alta conversión, con intensidad por tier. Reutiliza el copy de conversión
 * (E1.8): los beneficios → bloques de historia; mainBenefit → cierre.
 *
 * F1 (esqueleto): hero → stats_bar → cta(mid) → closing_invite → footer_brand.
 * F2/F3 insertan story_blocks, curated_gallery, location_showcase, floor_plans.
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import type { TemplateManifest } from './types'
import { type ConversionCopy, deterministicConversionCopy } from '@/lib/landing/conversion-copy'
import { deriveTier, tierConfig, type LandingTier } from '@/lib/landing/tier'
import { planPhotos } from '@/lib/landing/photo-plan'

/** Etiqueta de la oferta del hero según la operación. */
function offerLabelFor(property: LandingProperty): string {
  return (property.operation_type ?? 'venta') !== 'venta' ? 'Precio de alquiler' : 'Precio de venta'
}

const TIE_LABEL: Record<string, string> = {
  propiedad: 'La propiedad',
  ubicacion: 'La ubicación',
  amenities: 'Los amenities',
  otro: 'La propiedad',
}
const NUMERALS = ['I', 'II', 'III']

/** Arma el documento de lujo desde el copy (IA o determinístico) + el tier. */
export function buildLuxuryDocument(
  property: LandingProperty,
  copy: ConversionCopy,
  tier: LandingTier,
): LandingDocument {
  const cfg = tierConfig(tier)
  const photos = planPhotos(property.photos ?? [])

  // Beneficios (E1.8) → bloques de historia numerados, con foto por índice.
  const storyItems = copy.benefits.slice(0, cfg.storyCount).map((b, i) => ({
    numeral: NUMERALS[i] ?? String(i + 1),
    eyebrow: TIE_LABEL[b.tie] ?? 'La propiedad',
    headline: b.title,
    body: b.body,
    tie: b.tie,
    ...(photos.story[i] != null ? { photoIndex: photos.story[i] } : {}),
  }))

  const blocks: LandingDocument['blocks'] = [
    {
      id: 'hero',
      type: 'hero',
      variant: 'cinematic',
      mediaMode: 'auto',
      heroPhotoIndex: 0,
      titleOverride: copy.titular,
      subtitle: copy.subtitulo,
      ctaLabel: copy.ctaLabel,
      offerLabel: offerLabelFor(property),
    },
    { id: 'stats', type: 'stats_bar' },
    { id: 'story', type: 'story_blocks', items: storyItems },
  ]

  // Galería solo si sobran fotos (después de hero + historia).
  if (photos.gallery.length > 0) {
    blocks.push({
      id: 'gallery',
      type: 'curated_gallery',
      eyebrow: 'La propiedad',
      title: 'Recorré cada rincón',
      photoIndices: photos.gallery,
      // Se ven gratis las que YA se vieron arriba (portada + historia): así
      // ninguna foto aparece a pantalla completa arriba y con candado acá.
      // Con el tier estándar son 3 (1 portada + 2 de historia).
      freePhotoCount: 1 + storyItems.length,
    })
  }

  // Planos: condicional (solo si la propiedad tiene planos cargados).
  const plans = (property as { plans?: string[] | null }).plans ?? []
  if (plans.length > 0) {
    blocks.push({ id: 'plans', type: 'floor_plans', title: 'Distribución' })
  }

  // CTA intermedio con estilo de lujo (reusa closing_invite; abre el popup).
  blocks.push({
    id: 'cta-mid',
    type: 'closing_invite',
    eyebrow: 'Agendá tu visita',
    headline: copy.midCtaHeadline,
    ctaLabel: copy.ctaLabel,
  })

  blocks.push({
    id: 'location',
    type: 'location_showcase',
    eyebrow: 'Ubicación',
    body: copy.locationNote,
    ...(photos.location != null ? { photoIndex: photos.location } : {}),
  })

  blocks.push(
    {
      id: 'closing',
      type: 'closing_invite',
      eyebrow: 'Con cita previa',
      headline: copy.mainBenefitHeadline,
      body: copy.mainBenefitBody,
      ctaLabel: copy.ctaLabel,
    },
    { id: 'footer', type: 'footer_brand' },
  )

  return { version: 1, blocks, theme: { motion: 'on' } }
}

function build(property: LandingProperty): LandingDocument {
  return buildLuxuryDocument(property, deterministicConversionCopy(property), deriveTier(property))
}

export const luxuryTemplate: TemplateManifest = {
  id: 'luxury',
  label: 'Lujo',
  description: 'Landing editorial de lujo, replicable: beneficios intangibles + galería + CTAs a popup.',
  bestFor: 'Todas las propiedades',
  supportsVideo: true,
  build,
}
