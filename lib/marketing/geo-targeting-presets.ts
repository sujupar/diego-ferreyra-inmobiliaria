/**
 * Presets geográficos profesionales para el wizard de Meta Ads.
 *
 * Tres opciones que el asesor entiende sin saber de Meta:
 *   1. "Cercanos" — un pin de 2km en la propiedad. Hipersegmentación local.
 *   2. "Barrios similares" — múltiples pines de 2km en barrios del mismo cluster
 *      socioeconómico. Más alcance pero manteniendo perfil de comprador.
 *   3. "Amplio" — radio grande para premium / inversores que vienen de cualquier zona.
 *
 * Cada preset devuelve un `targeting.spec` compatible con la Meta Marketing API.
 *
 * Cambio importante 2026-05-23: antes "similares" usaba 1 pin de 10km que
 * cubría todo Buenos Aires y degradaba la performance. Ahora usa pines de
 * 2km en los barrios del cluster, lo que mantiene precisión + alcance.
 */
import type { Property } from '@/lib/portals/types'
import type { BuyerPersona } from './buyer-persona-generator'
import { siblingNeighborhoods, findNeighborhood } from './neighborhood-data'

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

/** Radio default por pin: 2km. Hipersegmentación efectiva para inmobiliaria. */
const PIN_RADIUS_KM = 2

export function buildGeoPresets(
  property: Property,
  persona: BuyerPersona,
): GeoPreset[] {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('Property sin lat/lng — no se pueden armar presets geo')
  }

  const presets: GeoPreset[] = []

  // 1. Cercanos: UN pin de 2km en la propiedad.
  //    Hipersegmentación local — gente que vive o trabaja muy cerca.
  presets.push({
    id: 'cercanos',
    label: 'Personas cercanas',
    description: `Gente que vive o trabaja a menos de ${PIN_RADIUS_KM} km de la propiedad. Hipersegmentación: bajo alcance pero alta relevancia.`,
    estimatedReach: persona.incomeLevel === 'premium' ? '~30k personas' : '~80k personas',
    spec: {
      geo_locations: {
        custom_locations: [
          {
            latitude: property.latitude,
            longitude: property.longitude,
            radius: PIN_RADIUS_KM,
            distance_unit: 'kilometer',
          },
        ],
      },
      age_min: persona.ageRange[0],
      age_max: persona.ageRange[1],
      publisher_platforms: ['facebook', 'instagram'],
    },
  })

  // 2. Similares: MÚLTIPLES pines de 2km — uno en el barrio de la propiedad +
  //    uno en cada barrio del mismo cluster socioeconómico.
  //    Esto es lo que el usuario pidió: mantener precisión (2km) pero ampliar
  //    alcance a barrios con perfil de comprador similar. No es un único radio
  //    grande que diluye el targeting — son varios pines acotados que apuntan
  //    a personas concretas.
  const siblings = siblingNeighborhoods(property.neighborhood, 6)
  const foundProperty = findNeighborhood(property.neighborhood)
  const similarPins = [
    // Pin en el barrio actual (re-usa lat/lng exacto de la propiedad)
    {
      latitude: property.latitude,
      longitude: property.longitude,
      radius: PIN_RADIUS_KM,
      distance_unit: 'kilometer' as const,
    },
    // Pines en barrios del mismo cluster
    ...siblings.map(n => ({
      latitude: n.lat,
      longitude: n.lng,
      radius: PIN_RADIUS_KM,
      distance_unit: 'kilometer' as const,
    })),
  ]
  const siblingNames = siblings.map(n => n.name).slice(0, 4).join(', ')
  presets.push({
    id: 'similares',
    label: 'Barrios con perfil parecido',
    description: foundProperty
      ? `${similarPins.length} pines de ${PIN_RADIUS_KM} km cada uno, en ${property.neighborhood} y barrios con perfil similar (${siblingNames}…). Más alcance manteniendo el perfil de comprador.`
      : `${similarPins.length} pines de ${PIN_RADIUS_KM} km cada uno, en barrios con perfil parecido al de la propiedad.`,
    estimatedReach:
      foundProperty?.cluster === 'premium'
        ? '~200k personas'
        : foundProperty?.cluster === 'alto'
          ? '~450k personas'
          : '~700k personas',
    spec: {
      geo_locations: {
        custom_locations: similarPins,
      },
      age_min: persona.ageRange[0],
      age_max: persona.ageRange[1],
      publisher_platforms: ['facebook', 'instagram'],
    },
  })

  // 3. Amplio: radio grande centrado en Obelisco — para premium / inversores
  //    que vienen de cualquier zona.
  presets.push({
    id: 'amplio',
    label: 'Toda CABA (premium / inversores)',
    description:
      'Para propiedades premium o de inversión donde el comprador puede venir de cualquier zona de CABA.',
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
