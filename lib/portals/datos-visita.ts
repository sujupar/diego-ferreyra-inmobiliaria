/**
 * Puente entre la VISITA de tasación (`deals.visit_data`) y los PORTALES.
 *
 * Pedido del dueño (2026-09-14): que la asistente no vuelva a cargar, al
 * publicar, lo que el asesor ya sabía en la visita. Este módulo (puro, sin
 * red ni base) hace tres cosas:
 *   1. Traduce lo que la visita ya tiene a los ids de MercadoLibre y Argenprop.
 *   2. Dice qué campos del schema de cada portal quedan PENDIENTES de preguntar
 *      en la visita (los que no se derivan y no son administrativos).
 *   3. Arma lo que la propiedad hereda al captar: `expensas`, `portal_data` y
 *      `landing_answers`.
 */
import type { SaleVisitData, VisitDataSnapshot, ValorAtributoPortal } from '@/types/visit-data.types'
import type { CategoryAttribute } from './mercadolibre/category-attributes'
import type { ApField } from './argenprop/field-schema'

export type ValoresPortal = Record<string, ValorAtributoPortal>

/**
 * Datos administrativos que se cargan recién al publicar (no son de la
 * propiedad: horario de contacto, código interno, número de unidad/torre…).
 */
export const ATRIBUTOS_ML_ADMINISTRATIVOS: readonly string[] = [
  'CONTACT_SCHEDULE', 'PROPERTY_CODE', 'AVAILABLE', 'APARTMENT_NUMBER', 'HOUSE_NUMBER', 'TOWER_NUMBER',
]

/** Lo que ya sale de la visita (secciones 01–03) o de columnas de la propiedad. */
const ML_DERIVADOS: readonly string[] = [
  'ROOMS', 'BEDROOMS', 'FULL_BATHROOMS', 'PARKING_LOTS', 'COVERED_AREA', 'TOTAL_AREA',
  'MAINTENANCE_FEE', 'PROPERTY_AGE', 'FLOORS', 'UNIT_FLOOR', 'DISPOSITION', 'FACING',
]
const AP_DERIVADOS: readonly string[] = [
  'TIPO_OPERACION', 'MONEDA', 'CANTIDAD_AMBIENTES', 'CANTIDAD_DORMITORIOS', 'CANTIDAD_BANOS',
  'CANTIDAD_COCHERAS', 'SUPERFICIE_CUBIERTA', 'SUPERFICIE_TOTAL', 'ANTIGUEDAD', 'EXPENSAS',
  'ORIENTACION', 'DISPOSICION',
]

const ML_DISPOSICION: Record<string, string> = { frente: 'Frente', contrafrente: 'Contrafrente', interno: 'Interno', lateral: 'Lateral' }
/** ML solo tiene las cuatro cardinales; una compuesta (NE, SO…) no se manda. */
const ML_ORIENTACION: Record<string, string> = { N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste' }

const AP_DISPOSICION: Record<string, string> = { frente: 'FRENTE', contrafrente: 'CONTRA_FRENTE', lateral: 'LATERAL', interno: 'INTERNO' }
const AP_ORIENTACION: Record<string, string> = {
  N: 'NORTE', S: 'SUR', E: 'ESTE', O: 'OESTE', NE: 'NORESTE', NO: 'NOROESTE', SE: 'SURESTE', SO: 'SUROESTE',
}
/** Escala Ross-Heidecke (9 estados) → los 5 estados comerciales de Argenprop. */
const AP_ESTADO: Record<string, string> = {
  estado_1: 'EXCELENTE', estado_1_5: 'EXCELENTE',
  estado_2: 'MUY_BUENO',
  estado_2_5: 'BUENO', estado_3: 'BUENO',
  estado_3_5: 'REGULAR', estado_4: 'REGULAR',
  estado_4_5: 'A_REFACCIONAR', estado_5: 'A_REFACCIONAR',
}

export function atributosMlDerivadosDeVisita(sale: SaleVisitData | null | undefined): ValoresPortal {
  const out: ValoresPortal = {}
  if (!sale) return out
  if (sale.rooms) out.ROOMS = { value_name: String(sale.rooms) }
  if (sale.bedrooms) out.BEDROOMS = { value_name: String(sale.bedrooms) }
  if (sale.bathrooms) out.FULL_BATHROOMS = { value_name: String(sale.bathrooms) }
  if (sale.garages) out.PARKING_LOTS = { value_name: String(sale.garages) }
  // number_unit: ML exige la unidad explícita (sino rechaza el aviso).
  if (sale.covered_m2) out.COVERED_AREA = { value_name: `${sale.covered_m2} m²` }
  if (sale.total_m2) out.TOTAL_AREA = { value_name: `${sale.total_m2} m²` }
  if (sale.age_years != null) out.PROPERTY_AGE = { value_name: sale.age_years === 0 ? 'A estrenar' : `${sale.age_years} años` }
  if (sale.total_floors != null) out.FLOORS = { value_name: String(sale.total_floors) }
  if (sale.floor != null) out.UNIT_FLOOR = { value_name: String(sale.floor) }
  if (sale.disposition && ML_DISPOSICION[sale.disposition]) out.DISPOSITION = { value_name: ML_DISPOSICION[sale.disposition] }
  if (sale.orientation && ML_ORIENTACION[sale.orientation]) out.FACING = { value_name: ML_ORIENTACION[sale.orientation] }
  return out
}

export function atributosApDerivadosDeVisita(sale: SaleVisitData | null | undefined): ValoresPortal {
  const out: ValoresPortal = {}
  if (!sale) return out
  if (sale.orientation && AP_ORIENTACION[sale.orientation]) out.ORIENTACION = { value_id: AP_ORIENTACION[sale.orientation] }
  if (sale.disposition && AP_DISPOSICION[sale.disposition]) out.DISPOSICION = { value_id: AP_DISPOSICION[sale.disposition] }
  if (sale.conservation && AP_ESTADO[sale.conservation]) out.ESTADO_PROPIEDAD = { value_id: AP_ESTADO[sale.conservation] }
  return out
}

export interface SchemasDePortales {
  ml: { required: CategoryAttribute[]; recommended: CategoryAttribute[] } | null
  ap: { required: ApField[]; recommended: ApField[] } | null
}

export interface CamposPendientes {
  ml: {
    /** Sí/No: se muestran como casillas. */
    checklist: CategoryAttribute[]
    /** Listas, números, texto: el control del wizard. */
    otros: CategoryAttribute[]
  }
  ap: ApField[]
}

/**
 * Qué falta preguntar en la visita para que los wizards salgan prellenados.
 * Las expensas no aparecen en ninguno de los dos: se piden UNA vez como campo
 * propio (`portales.expensas`) y cada portal las toma de `properties.expensas`.
 */
export function camposPendientesDeVisita(schemas: SchemasDePortales): CamposPendientes {
  const mlTodos = schemas.ml ? [...schemas.ml.required, ...schemas.ml.recommended] : []
  const mlPendientes = mlTodos.filter(a => !ML_DERIVADOS.includes(a.id) && !ATRIBUTOS_ML_ADMINISTRATIVOS.includes(a.id))
  const apTodos = schemas.ap ? [...schemas.ap.required, ...schemas.ap.recommended] : []
  return {
    ml: {
      checklist: mlPendientes.filter(a => a.valueType === 'boolean'),
      otros: mlPendientes.filter(a => a.valueType !== 'boolean'),
    },
    ap: apTodos.filter(f => !AP_DERIVADOS.includes(f.id)),
  }
}

/**
 * Para atributos de LISTA que llegan solo con `value_name` (los derivados de la
 * visita no conocen los ids de ML), busca el id en el schema por nombre. Así el
 * select del paso Campos los muestra elegidos en vez de vacíos.
 */
export function resolverIdsDeLista(valores: ValoresPortal, atributos: readonly CategoryAttribute[]): ValoresPortal {
  const porId = new Map(atributos.map(a => [a.id, a]))
  const out: ValoresPortal = {}
  for (const [id, v] of Object.entries(valores)) {
    const attr = porId.get(id)
    if (attr?.valueType === 'list' && !v.value_id && v.value_name && attr.allowedValues) {
      const nombre = v.value_name.trim().toLowerCase()
      const match = attr.allowedValues.find(av => av.name.trim().toLowerCase() === nombre)
      out[id] = match ? { value_id: match.id } : v
    } else {
      out[id] = v
    }
  }
  return out
}

export interface DatosDifusionHeredados {
  expensas: number | null
  portal_data: { ml: ValoresPortal; ap: ValoresPortal }
  landing_answers: Record<string, string>
}

function limpiarValores(v: unknown): ValoresPortal {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: ValoresPortal = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue
    const o = val as { value_id?: unknown; value_name?: unknown }
    const limpio: ValorAtributoPortal = {}
    if (typeof o.value_id === 'string' && o.value_id.trim()) limpio.value_id = o.value_id.trim()
    if (typeof o.value_name === 'string' && o.value_name.trim()) limpio.value_name = o.value_name.trim()
    if (limpio.value_id || limpio.value_name) out[k] = limpio
  }
  return out
}

/** Lo que la propiedad hereda al captar. Lo contestado por el asesor manda sobre lo derivado. */
export function armarDatosDifusionDesdeVisita(snapshot: VisitDataSnapshot | null | undefined): DatosDifusionHeredados {
  const sale = snapshot?.sale ?? null
  const portales = snapshot?.portales ?? null
  const expensas = typeof portales?.expensas === 'number' && portales.expensas > 0 ? portales.expensas : null
  const landing: Record<string, string> = {}
  for (const [k, v] of Object.entries(snapshot?.landing ?? {})) {
    if (typeof v === 'string' && v.trim()) landing[k] = v.trim()
  }
  return {
    expensas,
    portal_data: {
      ml: { ...atributosMlDerivadosDeVisita(sale), ...limpiarValores(portales?.ml) },
      ap: { ...atributosApDerivadosDeVisita(sale), ...limpiarValores(portales?.ap) },
    },
    landing_answers: landing,
  }
}
