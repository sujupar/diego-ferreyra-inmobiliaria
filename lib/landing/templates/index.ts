/**
 * E1.3 — Registro de templates de landing.
 *
 * Un solo lugar donde viven los templates disponibles. La UI de selección
 * (E1.4) lista estos; `getTemplate(id)` resuelve por id con fallback al default.
 * El schema soporta N templates desde el día 1 — se agregan más en E1.7.
 */
import type { TemplateManifest } from './types'
import { conversionTemplate } from './conversion'
import { editorialDirecto } from './editorial-directo'
import { cinematicEstate } from './cinematic-estate'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingDocument } from '@/lib/landing/schema'

// E1.8 — el default es "conversión" (beneficios intangibles + CTAs a popup).
// Los legacy editorial/cinematic quedan disponibles como alternativas.
export const DEFAULT_TEMPLATE_ID = 'conversion'

/** Orden de presentación en la UI. */
export const TEMPLATES: TemplateManifest[] = [conversionTemplate, editorialDirecto, cinematicEstate]

const BY_ID = new Map(TEMPLATES.map(t => [t.id, t]))

export function getTemplate(id: string | null | undefined): TemplateManifest {
  return (id && BY_ID.get(id)) || conversionTemplate
}

/** Construye el LandingDocument de una propiedad con el template pedido. */
export function buildFromTemplate(
  templateId: string | null | undefined,
  property: LandingProperty,
): { templateId: string; document: LandingDocument } {
  const t = getTemplate(templateId)
  return { templateId: t.id, document: t.build(property) }
}

/** Sugerencia de template. E1.8: conversión para todas (embudo de marketing). */
export function suggestTemplateId(_funnelType: 'venta_propiedad' | 'alto_valor'): string {
  return DEFAULT_TEMPLATE_ID
}

export type { TemplateManifest } from './types'
