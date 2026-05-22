/**
 * Presets geográficos simples para el wizard de Meta Ads.
 *
 * Tres opciones que el asesor entiende sin saber de Meta:
 *   1. "Cercanos" — radio de 3-5km desde la propiedad
 *   2. "Barrios similares" — clusters socioeconómicos parecidos
 *   3. "Amplio" — todo CABA + GBA Norte (premium / inversores)
 *
 * Cada preset devuelve un `targeting.spec` compatible con la Meta Marketing API.
 *
 * Los clusters están hardcoded — si en el futuro necesitan editarse desde UI,
 * se mueven a una tabla `neighborhood_clusters` en Supabase.
 */
import type { Property } from '@/lib/portals/types'
import type { BuyerPersona } from './buyer-persona-generator'

export type GeoPresetId = 'cercanos' | 'similares' | 'amplio'

export interface MetaTargetingSpec {
  geo_locations: {
    custom_locations?: Array<{
      latitude: number
      longitude: number
      radius: number
      distance_unit: 'kilometer' | 'mile'
    }>
    cities?: Array<{ key: string; radius: number; distance_unit: string }>
    regions?: Array<{ key: string }>
  }
  age_min: number
  age_max: number
  publisher_platforms: string[]
  facebook_positions?: string[]
  instagram_positions?: string[]
}

export interface GeoPreset {
  id: GeoPresetId
  label: string
  description: string
  estimatedReach: string
  spec: MetaTargetingSpec
}

// Clusters CABA por nivel socioeconómico (simplificado)
const CLUSTERS = {
  premium: ['Recoleta', 'Puerto Madero', 'Núñez', 'Belgrano'],
  alto: ['Palermo', 'Belgrano', 'Núñez', 'Caballito', 'Villa Urquiza', 'Colegiales'],
  medio_alto: [
    'Palermo',
    'Villa Crespo',
    'Caballito',
    'Almagro',
    'Colegiales',
    'Chacarita',
  ],
  medio: ['Almagro', 'Flores', 'Boedo', 'Villa Crespo', 'San Telmo'],
}

function clusterFor(persona: BuyerPersona): string[] {
  return CLUSTERS[persona.incomeLevel] ?? CLUSTERS.medio
}

export function buildGeoPresets(
  property: Property,
  persona: BuyerPersona,
): GeoPreset[] {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('Property sin lat/lng — no se pueden armar presets geo')
  }

  const presets: GeoPreset[] = []

  // 1. Cercanos: radio 3km (entry/medio) o 5km (alto+)
  const radiusKm = persona.incomeLevel === 'premium' || persona.incomeLevel === 'alto' ? 5 : 3
  presets.push({
    id: 'cercanos',
    label: 'Personas cercanas',
    description: `Gente que vive o trabaja a menos de ${radiusKm} km de la propiedad. Bueno para barrios con identidad fuerte.`,
    estimatedReach: persona.incomeLevel === 'premium' ? '~80k personas' : '~200k personas',
    spec: {
      geo_locations: {
        custom_locations: [
          {
            latitude: property.latitude,
            longitude: property.longitude,
            radius: radiusKm,
            distance_unit: 'kilometer',
          },
        ],
      },
      age_min: persona.ageRange[0],
      age_max: persona.ageRange[1],
      publisher_platforms: ['facebook', 'instagram'],
    },
  })

  // 2. Similares: clusters socioeconómicos parecidos
  const cluster = clusterFor(persona)
  presets.push({
    id: 'similares',
    label: 'Barrios con perfil parecido',
    description: `Gente en barrios de poder adquisitivo similar: ${cluster.slice(0, 4).join(', ')}…`,
    estimatedReach: '~500k personas',
    spec: {
      geo_locations: {
        // Sin city keys reales (requeriría /search Meta API). Por ahora usamos
        // ubicación de la propiedad + radio amplio para aproximar cluster.
        custom_locations: [
          {
            latitude: property.latitude,
            longitude: property.longitude,
            radius: 10,
            distance_unit: 'kilometer',
          },
        ],
      },
      age_min: persona.ageRange[0],
      age_max: persona.ageRange[1],
      publisher_platforms: ['facebook', 'instagram'],
    },
  })

  // 3. Amplio: toda CABA
  presets.push({
    id: 'amplio',
    label: 'Toda CABA (premium / inversores)',
    description:
      'Para propiedades premium o de inversión donde el comprador puede venir de cualquier zona.',
    estimatedReach: '~3M personas',
    spec: {
      geo_locations: {
        custom_locations: [
          {
            latitude: -34.6037,
            longitude: -58.3816,
            radius: 25,
            distance_unit: 'kilometer',
          },
        ],
      },
      age_min: Math.max(25, persona.ageRange[0]),
      age_max: persona.ageRange[1],
      publisher_platforms: ['facebook', 'instagram'],
    },
  })

  return presets
}

export function recommendPreset(persona: BuyerPersona): GeoPresetId {
  if (persona.incomeLevel === 'premium' || persona.familyStatus === 'inversor') {
    return 'amplio'
  }
  if (persona.incomeLevel === 'alto') return 'similares'
  return 'cercanos'
}
