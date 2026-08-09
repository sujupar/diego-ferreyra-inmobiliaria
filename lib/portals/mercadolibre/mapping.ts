import type { Property } from '../types'
import type { AttributeOverride } from './category-attributes'
import { extractYouTubeId } from './media'
import { ML_MAX_FOTOS_AVISO } from '../photo-limits'

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
 * Default `free` (publicación gratuita — decisión del usuario). El orden DEBE quedar
 * descendente para que el fallback del adapter pruebe el tier inferior. (gold_special
 * NO aplica a inmuebles — ML lo rechaza con listing_type.invalid para MLA1473/casas/PH.)
 */
export const ML_LISTING_TYPES: { id: string; label: string }[] = [
  { id: 'gold_premium', label: 'Premium (máxima exposición)' },
  { id: 'silver', label: 'Clásica' },
  { id: 'free', label: 'Gratuita' },
]

/**
 * Categorías MLA (MercadoLibre Argentina) para inmuebles.
 *
 * TODAS estas categorías fueron verificadas el 2026-08-06 recorriendo el árbol
 * real desde `GET /categories/MLA1459`: cada una es HOJA (sin hijos) y tiene
 * `settings.listing_allowed = true`. El comentario al lado de cada una es su
 * ruta completa en el árbol de ML.
 *
 * POR QUÉ ESTO IMPORTA: el mapa anterior tenía las 11 entradas mal. Tres IDs ni
 * siquiera existían (404), cuatro apuntaban a categorías PADRE —que ML rechaza
 * con "Make sure you're posting in a leaf category"— y, lo peor, tres apuntaban
 * a hojas válidas pero del rubro equivocado: "departamento en venta" iba a
 * "Departamentos > ALQUILER", que ML acepta sin chistar. Ese es el modo de falla
 * peligroso: publica mal y nadie se entera.
 *
 * OJO — en VENTA el nodo "Venta" NO es hoja: hay un tercer nivel
 * (Emprendimientos vs Propiedades Individuales). Usamos "Propiedades
 * Individuales", que es el caso de una inmobiliaria que vende unidades usadas.
 *
 * NO AGREGAR UNA ENTRADA A MANO sin correr `scripts/verify-ml-categories.ts`,
 * que consulta ML y falla si alguna no es hoja publicable.
 */
const CATEGORY_MAP: Record<string, Record<string, string>> = {
  venta: {
    departamento: 'MLA401686', // Inmuebles > Departamentos > Venta > Propiedades Individuales
    casa:         'MLA401685', // Inmuebles > Casas > Venta > Propiedades Individuales
    ph:           'MLA105182', // Inmuebles > PH > Venta
    terreno:      'MLA401687', // Inmuebles > Terrenos y Lotes > Venta > Propiedades Individuales
    local:        'MLA79244',  // Inmuebles > Locales > Venta
    oficina:      'MLA401684', // Inmuebles > Oficinas > Venta > Propiedades Individuales
  },
  alquiler: {
    departamento: 'MLA1473',   // Inmuebles > Departamentos > Alquiler
    casa:         'MLA1467',   // Inmuebles > Casas > Alquiler
    ph:           'MLA105181', // Inmuebles > PH > Alquiler
    terreno:      'MLA1494',   // Inmuebles > Terrenos y Lotes > Alquiler
    local:        'MLA79243',  // Inmuebles > Locales > Alquiler
    oficina:      'MLA50539',  // Inmuebles > Oficinas > Alquiler
  },
  temporario: {
    departamento: 'MLA50279',  // Inmuebles > Departamentos > Alquiler Temporario
    casa:         'MLA50278',  // Inmuebles > Casas > Alquiler Temporario
    ph:           'MLA105180', // Inmuebles > PH > Alquiler Temporario
    // ML no tiene alquiler temporario para terreno/local/oficina: caen en
    // "Otros Inmuebles > Alquiler Temporario", que sí es hoja publicable.
    terreno:      'MLA50283',  // Inmuebles > Otros Inmuebles > Alquiler Temporario
    local:        'MLA50283',
    oficina:      'MLA50283',
  },
}

/** Los 6 tipos que ofrece el formulario de alta de propiedades. */
export const ML_TIPOS_SOPORTADOS = ['departamento', 'casa', 'ph', 'terreno', 'local', 'oficina'] as const
export const ML_OPERACIONES_SOPORTADAS = ['venta', 'alquiler', 'temporario'] as const

/**
 * Categoría de ML para la propiedad, o `null` si la combinación no está mapeada.
 *
 * Devuelve `null` a propósito y NO cae en una categoría genérica: el mapa
 * anterior tenía un fallback a "Inmuebles" (la raíz del árbol), que ML rechaza
 * siempre. Un fallback silencioso en un dato de un sistema ajeno es peor que un
 * error: o falla igual más adelante con un mensaje incomprensible, o —peor—
 * publica en un rubro que no corresponde. Quien llame a esta función tiene que
 * manejar el `null` con un mensaje claro.
 */
export function resolveCategory(property: Property): string | null {
  const operation = normalizarOperacion(property.operation_type)
  const type = (property.property_type || 'departamento').trim().toLowerCase()
  return CATEGORY_MAP[operation]?.[type] ?? null
}

/**
 * La operación se escribe de más de una forma en el sistema. La columna de la
 * base documenta `venta | alquiler | temporario`, pero el resto del código ya
 * contempla "alquiler temporario" y "alquiler_temporario" (ver
 * `operationLabelFor` en lib/properties/detail-view.ts). Sin esta normalización,
 * un temporario escrito de la forma larga no encuentra categoría y la
 * publicación se bloquea sin motivo real.
 */
function normalizarOperacion(raw: string | null | undefined): string {
  const s = (raw || 'venta').trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  if (s === 'alquiler temporario' || s === 'temporal' || s === 'temporaria') return 'temporario'
  return s
}

/** Mensaje único para cuando la propiedad no tiene categoría posible en ML. */
export function mensajeSinCategoria(property: Property): string {
  return (
    `No hay categoría de MercadoLibre para una propiedad de tipo ` +
    `"${property.property_type ?? 'sin tipo'}" en operación ` +
    `"${property.operation_type ?? 'venta'}". Revisá esos dos datos en la ficha.`
  )
}

/** Todas las combinaciones mapeadas. Lo usa el verificador contra la API de ML. */
export function todasLasCategorias(): { operacion: string; tipo: string; categoria: string }[] {
  return Object.entries(CATEGORY_MAP).flatMap(([operacion, porTipo]) =>
    Object.entries(porTipo).map(([tipo, categoria]) => ({ operacion, tipo, categoria })),
  )
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

/**
 * ML exige unidad explícita en los atributos `number_unit` (superficies, antigüedad).
 * Si un valor llega como número pelado ("95"), ML lo rechaza:
 *   "Attribute COVERED_AREA ... is required and was omitted. The provided unit is not valid."
 * Esto pasa cuando un override del wizard (o el prefill) trae el número sin unidad.
 * Normalizamos al chokepoint: a los *_AREA les ponemos "m²" y a PROPERTY_AGE "años".
 */
function normalizeUnit(attr: MlAttribute): MlAttribute {
  if (!attr.value_name) return attr
  const v = attr.value_name.trim()
  if (!/^[\d.,]+$/.test(v)) return attr // ya tiene unidad, o es texto (ej. "A estrenar")
  if (/_AREA$/.test(attr.id)) return { ...attr, value_name: `${v} m²` }
  if (attr.id === 'PROPERTY_AGE') return { ...attr, value_name: `${v} años` }
  return attr
}

function buildAttributes(property: Property, opts: MlPayloadOptions): MlAttribute[] {
  const map = new Map<string, MlAttribute>()
  for (const a of derivedAttributes(property)) map.set(a.id, a)
  for (const [id, ov] of Object.entries(opts.attributeOverrides ?? {})) {
    if (ov.value_id) map.set(id, { id, value_id: ov.value_id })
    else if (ov.value_name != null && ov.value_name !== '') map.set(id, { id, value_name: ov.value_name })
    else map.delete(id) // override vacío = limpiar
  }
  let result = [...map.values()].map(normalizeUnit)
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
  const prov = (property.province ?? '').trim()
  const isCaba =
    /^caba$/i.test(prov) || /capital federal|ciudad aut[oó]noma/i.test(prov) ||
    (!prov && (!cityRaw || /^caba$/i.test(cityRaw) || /capital federal/i.test(cityRaw) || /ciudad aut[oó]noma/i.test(cityRaw)))

  // state: CABA → "Capital Federal"; si hay province explícita usarla; si no, heurística "Buenos Aires".
  const stateName = isCaba ? 'Capital Federal' : (prov && !/buenos aires/i.test(prov) ? prov : 'Buenos Aires')
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
  const categoria = resolveCategory(property)
  if (!categoria) throw new Error(mensajeSinCategoria(property))
  const payload: MlPayload = {
    title: buildTitle(property),
    category_id: categoria,
    price: property.asking_price,
    currency_id: property.currency || 'USD',
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: opts.listingType || 'free',
    condition: 'new',
    pictures: (property.photos ?? []).slice(0, ML_MAX_FOTOS_AVISO).map(source => ({ source })),
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
