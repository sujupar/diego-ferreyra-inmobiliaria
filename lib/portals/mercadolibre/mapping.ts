import type { Property } from '../types'

export interface MlPayload {
  title: string
  category_id: string
  price: number
  currency_id: string
  available_quantity: number
  buying_mode: 'classified'
  listing_type_id: string
  condition: 'new'
  pictures: { source: string }[]
  description: { plain_text: string }
  attributes: { id: string; value_name: string }[]
  location: { latitude: number; longitude: number; address_line: string }
  video_id?: string
}

/**
 * Categorías MLA (MercadoLibre Argentina) para inmuebles.
 * Mapeo simplificado por operación y tipo. Ver:
 * https://developers.mercadolibre.com.ar/es_ar/list-properties
 */
const CATEGORY_MAP: Record<string, Record<string, string>> = {
  venta: {
    departamento: 'MLA1473',
    casa: 'MLA1472',
    ph: 'MLA1471',
    terreno: 'MLA1493',
    local: 'MLA1494',
    oficina: 'MLA1495',
  },
  alquiler: {
    departamento: 'MLA1463',
    casa: 'MLA1462',
  },
  temporario: {
    departamento: 'MLA50547',
    casa: 'MLA50548',
  },
}

const FALLBACK_CATEGORY = 'MLA1459' // Inmuebles top

function pickCategory(operation: string, type: string): string {
  return CATEGORY_MAP[operation]?.[type] ?? FALLBACK_CATEGORY
}

function buildTitle(property: Property): string {
  if (property.title) return property.title.slice(0, 60)
  const type = (property.property_type || 'departamento')
  const typeCap = type.charAt(0).toUpperCase() + type.slice(1)
  const rooms = property.rooms ? `${property.rooms} amb` : ''
  const parts = [typeCap, rooms, property.neighborhood].filter(Boolean)
  return parts.join(' ').slice(0, 60)
}

function buildAttributes(property: Property): { id: string; value_name: string }[] {
  const attrs: { id: string; value_name: string }[] = []
  if (property.rooms) attrs.push({ id: 'ROOMS', value_name: String(property.rooms) })
  if (property.bedrooms) attrs.push({ id: 'BEDROOMS', value_name: String(property.bedrooms) })
  if (property.bathrooms) attrs.push({ id: 'FULL_BATHROOMS', value_name: String(property.bathrooms) })
  if (property.garages) attrs.push({ id: 'PARKING_LOTS', value_name: String(property.garages) })
  if (property.covered_area) {
    attrs.push({ id: 'COVERED_AREA', value_name: `${property.covered_area} m²` })
  }
  if (property.total_area) {
    attrs.push({ id: 'TOTAL_AREA', value_name: `${property.total_area} m²` })
  }
  if (property.expensas) {
    attrs.push({ id: 'MAINTENANCE_FEE', value_name: `${property.expensas} ARS` })
  }
  if (property.age != null) {
    attrs.push({ id: 'PROPERTY_AGE', value_name: String(property.age) })
  }
  if (property.floor != null) {
    attrs.push({ id: 'FLOORS', value_name: String(property.floor) })
  }
  return attrs
}

export function propertyToMlPayload(property: Property): MlPayload {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToMlPayload: lat/lng requeridos (corré validate antes)')
  }
  const operation = property.operation_type || 'venta'
  const type = (property.property_type || 'departamento').toLowerCase()
  const category = pickCategory(operation, type)

  return {
    title: buildTitle(property),
    category_id: category,
    price: property.asking_price,
    currency_id: property.currency || 'USD',
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: 'silver',
    condition: 'new',
    pictures: (property.photos ?? []).slice(0, 12).map(source => ({ source })),
    description: {
      plain_text: property.description || buildTitle(property),
    },
    attributes: buildAttributes(property),
    location: {
      latitude: property.latitude,
      longitude: property.longitude,
      address_line: `${property.address}, ${property.neighborhood}, ${property.city}`,
    },
  }
}
