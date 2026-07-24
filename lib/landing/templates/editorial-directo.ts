/**
 * E1.3 — Template "Editorial Directo" (default).
 *
 * Layout de conversión sobrio y directo: portada fuerte → prueba social →
 * características → galería → (video si hay) → descripción → ubicación → 1 CTA.
 * Sirve para el grueso de las propiedades (depto/casa/PH de valor medio).
 *
 * Es el default: message match claro, una sola oferta, CTA orientado a resultado.
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { type TemplateManifest, videoBlockFor } from './types'

function build(property: LandingProperty): LandingDocument {
  const video = videoBlockFor(property, 'video')
  const blocks: LandingDocument['blocks'] = [
    { id: 'hero', type: 'hero', variant: 'classic' },
    { id: 'proof', type: 'proof_bar' },
    { id: 'features', type: 'features' },
    { id: 'gallery', type: 'gallery' },
    ...(video ? [video] : []),
    { id: 'description', type: 'description' },
    { id: 'map', type: 'location_map' },
    { id: 'form', type: 'lead_form', ctaLabel: 'Quiero conocerla' },
  ]
  return { version: 1, blocks, theme: { motion: 'on' } }
}

export const editorialDirecto: TemplateManifest = {
  id: 'editorial-directo',
  label: 'Editorial Directo',
  description: 'Layout de conversión sobrio y directo. Ideal para la mayoría de las propiedades.',
  bestFor: 'Propiedades de valor medio (depto, casa, PH)',
  supportsVideo: true,
  build,
}
