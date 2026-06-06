import type { Property } from '../types'
import type { AttributeOverride } from './category-attributes'
import { extractYouTubeId } from './media'

export interface MlAttribute {
  id: string
  value_name?: string
  value_id?: string
}

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
  attributes: MlAttribute[]
  location: {
    latitude: number
    longitude: number
    address_line: string
    country: { name: string }
    state: { name: string }
    city: { name: string }
    neighborhood?: { name: string }
  }
  video_id?: string
}

export interface MlPayloadOptions {
  attributeOverrides?: Record<string, AttributeOverride>
  mediaChoice?: 'video' | 'tour' | 'none'
  listingType?: string
  /** Si se pasa, se descartan los atributos cuyo id no esté en el set (los que la categoría no acepta). */
  allowedAttributeIds?: Set<string>
}

/**
 * Listing types válidos para inmuebles MLA, de mayor a menor exposición.
 * Default gold_premium. (gold_special NO aplica a inmuebles — ML lo rechaza con
 * listing_type.invalid para MLA1473/casas/PH.)
 */
export const ML_LISTING_TYPES: { id: string; label: string }[] = [
  { id: 'gold_premium', label: 'Premium (máxima exposición)' },
  { id: 'silver', label: 'Clásica' },
  { id: 'free', label: 'Gratuita' },
]

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

export function resolveCategory(property: Property): string {
  const operation = property.operation_type || 'venta'
  const type = (property.property_type || 'departamento').toLowerCase()
  return CATEGORY_MAP[operation]?.[type] ?? FALLBACK_CATEGORY
}

function buildTitle(property: Property): string {
  if (property.title) return property.title.slice(0, 60)
  const type = property.property_type || 'departamento'
  const typeCap = type.charAt(0).toUpperCase() + type.slice(1)
  const rooms = property.rooms ? `${property.rooms} amb` : ''
  const parts = [typeCap, rooms, property.neighborhood].filter(Boolean)
  return parts.join(' ').slice(0, 60)
}

/** Atributos derivables de los campos de la propiedad (mapeo a ids ML conocidos). */
function derivedAttributes(property: Property): MlAttribute[] {
  const attrs: MlAttribute[] = []
  if (property.rooms) attrs.push({ id: 'ROOMS', value_name: String(property.rooms) })
  if (property.bedrooms) attrs.push({ id: 'BEDROOMS', value_name: String(property.bedrooms) })
  if (property.bathrooms) attrs.push({ id: 'FULL_BATHROOMS', value_name: String(property.bathrooms) })
  if (property.garages) attrs.push({ id: 'PARKING_LOTS', value_name: String(property.garages) })
  if (property.covered_area) attrs.push({ id: 'COVERED_AREA', value_name: `${property.covered_area} m²` })
  if (property.total_area) attrs.push({ id: 'TOTAL_AREA', value_name: `${property.total_area} m²` })
  if (property.expensas) attrs.push({ id: 'MAINTENANCE_FEE', value_name: `${property.expensas} ARS` })
  if (property.age != null) {
    // ML exige unidad explícita ("años", "meses", "días"). Sin la unidad:
    // "Attribute PROPERTY_AGE with value X was omitted."
    attrs.push({
      id: 'PROPERTY_AGE',
      value_name: property.age === 0 ? 'A estrenar' : `${property.age} años`,
    })
  }
  if (property.floor != null) attrs.push({ id: 'FLOORS', value_name: String(property.floor) })
  return attrs
}

function buildAttributes(property: Property, opts: MlPayloadOptions): MlAttribute[] {
  const map = new Map<string, MlAttribute>()
  for (const a of derivedAttributes(property)) map.set(a.id, a)
  for (const [id, ov] of Object.entries(opts.attributeOverrides ?? {})) {
    if (ov.value_id) map.set(id, { id, value_id: ov.value_id })
    else if (ov.value_name != null && ov.value_name !== '') map.set(id, { id, value_name: ov.value_name })
    else map.delete(id) // override vacío = limpiar
  }
  let result = [...map.values()]
  if (opts.allowedAttributeIds) result = result.filter(a => opts.allowedAttributeIds!.has(a.id))
  return result
}

/**
 * Construye el objeto location que ML espera con todos los niveles requeridos:
 * country, state, city. Sin estos campos ML devuelve:
 *   "Field 'location' requires up to city level."
 * Para CABA: state = "Capital Federal", city = barrio.
 */
function buildLocation(property: Property) {
  const cityRaw = (property.city ?? '').trim()
  const isCaba =
    !cityRaw ||
    /^caba$/i.test(cityRaw) ||
    /capital federal/i.test(cityRaw) ||
    /ciudad aut[oó]noma/i.test(cityRaw)

  const stateName = isCaba ? 'Capital Federal' : 'Buenos Aires'
  const cityName = isCaba ? property.neighborhood : cityRaw

  return {
    latitude: property.latitude!,
    longitude: property.longitude!,
    address_line: `${property.address}, ${property.neighborhood}, ${cityRaw || 'CABA'}`,
    country: { name: 'Argentina' },
    state: { name: stateName },
    city: { name: cityName },
    neighborhood: { name: property.neighborhood },
  }
}

export function propertyToMlPayload(property: Property, opts: MlPayloadOptions = {}): MlPayload {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToMlPayload: lat/lng requeridos (corré validate antes)')
  }
  const payload: MlPayload = {
    title: buildTitle(property),
    category_id: resolveCategory(property),
    price: property.asking_price,
    currency_id: property.currency || 'USD',
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: opts.listingType || 'gold_premium',
    condition: 'new',
    pictures: (property.photos ?? []).slice(0, 12).map(source => ({ source })),
    description: { plain_text: property.description || buildTitle(property) },
    attributes: buildAttributes(property, opts),
    location: buildLocation(property),
  }
  if (opts.mediaChoice === 'video') {
    const ytId = extractYouTubeId(property.video_url)
    if (ytId) payload.video_id = ytId
  } else if (opts.mediaChoice === 'tour' && property.tour_3d_url) {
    // ML no tiene campo nativo de recorrido 3D → lo agregamos como link al final
    // de la descripción (StepMedia se lo promete así al asesor).
    payload.description.plain_text = `${payload.description.plain_text}\n\nRecorrido virtual 360°: ${property.tour_3d_url}`
  }
  return payload
}
