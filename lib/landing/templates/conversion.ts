/**
 * E1.8 — Template "Conversión" (default nuevo).
 *
 * Estructura de máquina de conversión (feedback del usuario 2026-07-24), NO
 * ficha de portal:
 *   1. Zona caliente (hero): titular + subtítulo + [video|foto] + desc corta +
 *      precio + CTA #1 (abre popup).
 *   2. Prueba social (CUCICBA).
 *   3. 3 beneficios INTANGIBLES (propiedad / ubicación / amenities), al dolor.
 *   4. Showcase: beneficio principal + slides de imágenes.
 *   5. CTA #2.
 *   6. "Sobre esta propiedad" (storytelling).
 *   7. Beneficio principal destacado.
 *   8. Solo lo esencial (3-4 datos tangibles).
 *   9. Ubicación sutil (barrio + beneficio de zona, SIN mapa).
 *  10. CTA #3.
 * El popup de lead lo dispara cualquier CTA (LeadCaptureProvider, page-level).
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import type { TemplateManifest } from './types'
import {
  type ConversionCopy,
  deterministicConversionCopy,
} from '@/lib/landing/conversion-copy'

/** Elige hasta `n` índices de fotos para el showcase (evita repetir la portada). */
function showcasePhotoIndices(property: LandingProperty, n = 4): number[] {
  const total = property.photos?.length ?? 0
  if (total === 0) return []
  // Preferimos a partir de la 2da foto (la 0 es la portada del hero).
  const start = total > 1 ? 1 : 0
  const idxs: number[] = []
  for (let i = start; i < total && idxs.length < n; i++) idxs.push(i)
  return idxs
}

/** Arma el documento de conversión a partir del copy (IA o determinístico). */
export function buildConversionDocument(
  property: LandingProperty,
  copy: ConversionCopy,
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
      shortDesc: copy.shortDesc,
      ctaLabel: copy.ctaLabel,
    },
    { id: 'proof', type: 'proof_bar' },
    {
      id: 'benefits',
      type: 'intangible_benefits',
      eyebrow: 'Por qué esta propiedad',
      items: copy.benefits.slice(0, 3),
    },
    {
      id: 'showcase',
      type: 'benefit_showcase',
      headline: copy.showcaseHeadline,
      body: copy.showcaseBody,
      photoIndices: showcasePhotoIndices(property),
    },
    { id: 'cta-mid', type: 'cta', label: copy.ctaLabel, headline: copy.midCtaHeadline },
    { id: 'story', type: 'story', title: copy.storyTitle, body: copy.storyBody },
    { id: 'main-benefit', type: 'main_benefit', headline: copy.mainBenefitHeadline, body: copy.mainBenefitBody },
    { id: 'specs', type: 'essential_specs' },
    { id: 'location', type: 'location_note', text: copy.locationNote },
    { id: 'cta-final', type: 'cta', label: copy.ctaLabel, headline: copy.finalCtaHeadline },
  ]
  return { version: 1, blocks, theme: { motion: 'on' } }
}

function build(property: LandingProperty): LandingDocument {
  // Path auto (sin IA): copy determinístico benefit-framed.
  return buildConversionDocument(property, deterministicConversionCopy(property))
}

export const conversionTemplate: TemplateManifest = {
  id: 'conversion',
  label: 'Conversión',
  description:
    'Landing de conversión: beneficios intangibles, storytelling y 3 CTAs a popup. No parece portal.',
  bestFor: 'Todas las propiedades (embudo de marketing)',
  supportsVideo: true,
  build,
}
