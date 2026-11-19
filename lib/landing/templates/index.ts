/**
 * E1.3 — Registro de templates de landing.
 *
 * Un solo lugar donde viven los templates disponibles. La UI de selección
 * (E1.4) lista estos; `getTemplate(id)` resuelve por id con fallback al default.
 * El schema soporta N templates desde el día 1 — se agregan más en E1.7.
 */
import type { TemplateManifest } from './types'
import { luxuryTemplate } from './luxury'
import { conversionTemplate } from './conversion'
import { editorialDirecto } from './editorial-directo'
import { cinematicEstate } from './cinematic-estate'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingDocument } from '@/lib/landing/schema'

// E1.9 — el default es "lujo" (editorial replicable). conversion/editorial/
// cinematic quedan como alternativas / backwards-compat.
export const DEFAULT_TEMPLATE_ID = 'luxury'

/** Todas las plantillas que el sistema sabe ARMAR (incluye las viejas, para landings existentes). */
export const TEMPLATES: TemplateManifest[] = [luxuryTemplate, conversionTemplate, editorialDirecto, cinematicEstate]

/**
 * Las que el asesor puede ELEGIR (decisión del dueño, 2026-11-18): solo Lujo.
 * Las viejas quedan en `TEMPLATES` para no romper landings ya guardadas con
 * ellas, pero no se ofrecen: el 2026-11-18 alguien eligió "Editorial Directo"
 * para una propiedad con campaña activa y la landing salió con un formulario
 * en la página y estructura de ficha de portal.
 */
export const SELECTABLE_TEMPLATES: TemplateManifest[] = [luxuryTemplate]

export function isSelectableTemplate(id: string | null | undefined): boolean {
  return !!id && SELECTABLE_TEMPLATES.some(t => t.id === id)
}

const BY_ID = new Map(TEMPLATES.map(t => [t.id, t]))

export function getTemplate(id: string | null | undefined): TemplateManifest {
  return (id && BY_ID.get(id)) || luxuryTemplate
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
