/**
 * E1.3 — Template "Cinematic Estate".
 *
 * Layout cinematográfico para propiedades de ALTO VALOR: portada inmersiva,
 * galería y video protagonistas, tono aspiracional. Prioriza la emoción y la
 * exclusividad antes que la ficha técnica.
 *
 * Orden: portada cinematográfica → prueba social → galería grande → video →
 * características → descripción → ubicación → 1 CTA. Motion on.
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { type TemplateManifest, videoBlockFor } from './types'

function build(property: LandingProperty): LandingDocument {
  const video = videoBlockFor(property, 'video')
  const blocks: LandingDocument['blocks'] = [
    { id: 'hero', type: 'hero', variant: 'cinematic' },
    { id: 'proof', type: 'proof_bar' },
    { id: 'gallery', type: 'gallery' },
    ...(video ? [video] : []),
    { id: 'features', type: 'features' },
    { id: 'description', type: 'description' },
    { id: 'map', type: 'location_map' },
    { id: 'form', type: 'lead_form', ctaLabel: 'Solicitar una visita privada' },
  ]
  return { version: 1, blocks, theme: { motion: 'on' } }
}

export const cinematicEstate: TemplateManifest = {
  id: 'cinematic-estate',
  label: 'Cinematic Estate',
  description: 'Layout cinematográfico e inmersivo. Prioriza emoción y exclusividad.',
  bestFor: 'Propiedades de alto valor (USD 400k+)',
  supportsVideo: true,
  build,
}
