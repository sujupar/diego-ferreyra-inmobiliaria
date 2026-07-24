/**
 * E1.3 — Templates de landing.
 *
 * Un template NO es una página hardcodeada: es una FUNCIÓN que produce un
 * LandingDocument (bloques + theme) a partir de la propiedad. Elegir un template
 * = regenerar el `content`, mismo row, mismo slug. El asesor puede después
 * editar ese content en el editor (E1.6) sin volver a tocar el template.
 *
 * Cada template decide su orden de bloques y cómo maneja CON/SIN video.
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'

export interface TemplateManifest {
  /** id estable, se guarda en property_landings.template_id. */
  id: string
  /** Nombre para la UI de selección. */
  label: string
  /** Una línea de para qué sirve. */
  description: string
  /** Perfil ideal (ej. "propiedades de alto valor"). */
  bestFor: string
  /** Si el template aprovecha video cuando existe. */
  supportsVideo: boolean
  /** Construye el documento para ESTA propiedad (condiciona bloques por datos). */
  build: (property: LandingProperty) => LandingDocument
}

/** Helper: ¿la propiedad tiene algún video (archivo subido o embed)? */
export function hasVideo(property: LandingProperty): boolean {
  return Boolean(property.video_file_url || property.video_url)
}

/** Helper: el bloque de video correcto según lo que tenga la propiedad, o null. */
export function videoBlockFor(property: LandingProperty, id: string):
  | { id: string; type: 'video_file' }
  | { id: string; type: 'video_embed' }
  | null {
  if (property.video_file_url) return { id, type: 'video_file' }
  if (property.video_url) return { id, type: 'video_embed' }
  return null
}
