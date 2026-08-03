/**
 * E1.6 Editor — límites de longitud (del schema), secciones toggleables y defaults.
 */
import type { LandingBlock, LandingBlockType } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'

export const FIELD_MAX: Record<string, number> = {
  titleOverride: 160, subtitle: 200, offerLabel: 40, ctaLabel: 40, label: 40,
  'story.eyebrow': 60, 'story.headline': 160, 'story.body': 500,
  'gallery.eyebrow': 60, 'gallery.title': 120,
  'location.eyebrow': 60, 'location.title': 120, 'location.body': 400,
  'closing.eyebrow': 60, 'closing.headline': 200, 'closing.body': 400,
  // Página de gracias (`/v/<token>`). Los topes replican los del schema
  // (`ThanksContent`): si acá fueran más grandes, el guardado fallaría en Zod
  // recién al autosalvar, sin que el asesor entienda por qué.
  'thanks.greeting': 120, 'thanks.headline': 200, 'thanks.intro': 600,
  'thanks.scheduleTitle': 120, 'thanks.scheduleText': 600,
}

/** Secciones OPCIONALES que el asesor puede mostrar/ocultar (por id canónico). */
export const TOGGLEABLE: ReadonlyArray<{ id: string; type: LandingBlockType; label: string }> = [
  { id: 'gallery', type: 'curated_gallery', label: 'Galería de fotos' },
  { id: 'plans', type: 'floor_plans', label: 'Planos' },
  { id: 'location', type: 'location_showcase', label: 'Ubicación' },
]

/** Construye el bloque opcional con sus defaults (para re-mostrar una sección oculta). */
export function defaultOptionalBlock(id: string, property: LandingProperty): LandingBlock | null {
  const photos = property.photos ?? []
  switch (id) {
    case 'gallery':
      return {
        id: 'gallery', type: 'curated_gallery', eyebrow: 'La propiedad',
        title: 'Recorré cada rincón', photoIndices: photos.map((_, i) => i),
      }
    case 'plans':
      return { id: 'plans', type: 'floor_plans', title: 'Distribución' }
    case 'location':
      return { id: 'location', type: 'location_showcase', eyebrow: 'Ubicación' }
    default:
      return null
  }
}
