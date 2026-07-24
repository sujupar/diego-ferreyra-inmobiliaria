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
import { deriveTier, type LandingTier } from '@/lib/landing/tier'

/** Etiqueta de la oferta del hero según la operación. */
function offerLabelFor(property: LandingProperty): string {
  return (property.operation_type ?? 'venta') !== 'venta' ? 'Precio de alquiler' : 'Precio de venta'
}

/** Arma el documento de lujo desde el copy (IA o determinístico) + el tier. */
export function buildLuxuryDocument(
  property: LandingProperty,
  copy: ConversionCopy,
  _tier: LandingTier,
): LandingDocument {
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
    { id: 'cta-mid', type: 'cta', label: copy.ctaLabel, headline: copy.midCtaHeadline },
    {
      id: 'closing',
      type: 'closing_invite',
      eyebrow: 'Con cita previa',
      headline: copy.mainBenefitHeadline,
      body: copy.mainBenefitBody,
      ctaLabel: copy.ctaLabel,
    },
    { id: 'footer', type: 'footer_brand' },
  ]
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
