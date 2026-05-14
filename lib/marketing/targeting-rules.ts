/**
 * Reglas de targeting Meta. Rules-based según precio + geo de la propiedad.
 * Output: estructura compatible con el parámetro `targeting` de Meta
 * Marketing API.
 */
import type { Property } from '../portals/types'

export interface MetaTargetingSpec {
  geo_locations: {
    custom_locations?: Array<{
      latitude: number
      longitude: number
      radius: number
      distance_unit: 'kilometer' | 'mile'
    }>
    countries?: string[]
    regions?: Array<{ key: string }>
  }
  age_min: number
  age_max: number
  genders?: number[] // 1=hombre, 2=mujer; omitir = todos
  flexible_spec?: Array<{
    interests?: Array<{ id: string; name: string }>
  }>
  publisher_platforms: Array<'facebook' | 'instagram'>
  facebook_positions?: string[]
  instagram_positions?: string[]
}

/**
 * Intereses Meta relevantes para real estate Argentina.
 * IDs reales del Targeting API (verificados al construir la campaña).
 */
const REAL_ESTATE_INTERESTS = [
  { id: '6003397425735', name: 'Real estate' },
  { id: '6003315098934', name: 'Property' },
  { id: '6003393295343', name: 'Home buying' },
  { id: '6003348604581', name: 'Mortgage loan' },
]

function priceInUsd(property: Property, usdToArs: number): number {
  if (property.currency === 'USD') return property.asking_price
  if (property.currency === 'ARS') return property.asking_price / usdToArs
  return property.asking_price
}

/**
 * Calcula el radio en km alrededor de lat/lng según el precio de la propiedad.
 * Las propiedades más caras justifican alcance geográfico más amplio.
 *
 * Restricciones Meta:
 *  - radius mínimo 1km
 *  - radius máximo 80km
 */
function radiusKm(usd: number): number {
  if (usd <= 100_000) return 5
  if (usd <= 300_000) return 10
  if (usd <= 600_000) return 20
  return 40
}

export interface TargetingDecision {
  spec: MetaTargetingSpec
  reasoning: string
}

export function decideTargeting(
  property: Property,
  usdToArs: number,
): TargetingDecision {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('decideTargeting: requiere lat/lng en la propiedad')
  }
  const usd = priceInUsd(property, usdToArs)
  const radius = radiusKm(usd)

  const spec: MetaTargetingSpec = {
    geo_locations: {
      custom_locations: [
        {
          latitude: property.latitude,
          longitude: property.longitude,
          radius,
          distance_unit: 'kilometer',
        },
      ],
      countries: ['AR'],
    },
    age_min: 25,
    age_max: 65,
    flexible_spec: [{ interests: REAL_ESTATE_INTERESTS }],
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed', 'story', 'instream_video'],
    instagram_positions: ['stream', 'story', 'explore', 'reels'],
  }

  return {
    spec,
    reasoning: `Precio USD ${usd.toFixed(0)} → radio ${radius}km en CABA/GBA, intereses real estate, 25-65 años`,
  }
}
