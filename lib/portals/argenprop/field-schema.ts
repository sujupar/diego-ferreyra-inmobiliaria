import type { Property } from '../types'

/** Mismo shape que ML (CategoryAttribute/AttributeOverride) → la UI del wizard no cambia. */
export type ApValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list'

export interface ApField {
  id: string
  name: string
  valueType: ApValueType
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface AttributeOverride {
  value_name?: string
  value_id?: string
}

export interface ApSchema {
  categoryId: string
  required: ApField[]
  recommended: ApField[]
}

/** property_type → Categoria {Tipo, Subtipo} de Argenprop (sección 13.1 doc). */
export const AP_CATEGORIA: Record<string, { tipo: string; subtipo?: string }> = {
  departamento: { tipo: 'DEPARTAMENTO' },
  casa: { tipo: 'CASA' },
  ph: { tipo: 'DEPARTAMENTO', subtipo: 'PH' }, // PH es subtipo de Departamento
  terreno: { tipo: 'TERRENO' },
  local: { tipo: 'LOCAL' },
  oficina: { tipo: 'OFICINA' },
}

export function apCategoria(property: Property): { tipo: string; subtipo?: string } {
  const t = (property.property_type || 'departamento').toLowerCase()
  return AP_CATEGORIA[t] ?? AP_CATEGORIA.departamento
}

/** Subtipos por categoría (catálogo verificado, sección 13.1). */
const SUBTIPOS: Record<string, { id: string; name: string }[]> = {
  DEPARTAMENTO: ['DEPARTAMENTO', 'PISO', 'SEMIPISO', 'DUPLEX', 'TRIPLEX', 'LOFT', 'PENTHOUSE', 'PH'].map(id => ({ id, name: id.charAt(0) + id.slice(1).toLowerCase() })),
  CASA: ['CASA', 'CHALET', 'DUPLEX', 'TRIPLEX', 'CASA_QUINTA', 'CABANA', 'DEPARTAMENTO'].map(id => ({ id, name: id.replace(/_/g, ' ').toLowerCase() })),
}

const TIPO_OPERACION = [
  { id: 'VENTA', name: 'Venta' },
  { id: 'ALQUILER', name: 'Alquiler' },
  { id: 'ALQUILER_TEMPORAL', name: 'Alquiler temporal' },
]
const MONEDA = [
  { id: 'USD', name: 'Dólares (USD)' },
  { id: 'ARS', name: 'Pesos (ARS)' },
]
const ESTADO_PROPIEDAD = ['EXCELENTE', 'MUY_BUENO', 'BUENO', 'REGULAR', 'A_REFACCIONAR'].map(id => ({ id, name: id.replace(/_/g, ' ').toLowerCase() }))
const ORIENTACION = ['NORTE', 'NORESTE', 'NOROESTE', 'SUR', 'SURESTE', 'SUROESTE', 'ESTE', 'OESTE'].map(id => ({ id, name: id.toLowerCase() }))
const DISPOSICION = ['FRENTE', 'CONTRA_FRENTE', 'LATERAL', 'INTERNO'].map(id => ({ id, name: id.replace(/_/g, ' ').toLowerCase() }))

/**
 * Catálogo curado de campos que pide Argenprop, prellenados desde la propiedad.
 * `required` bloquea el publish; `recommended` suma a la calidad. Los Ids de
 * características son los reales de la API (CANTIDAD_AMBIENTES, etc.). Mapea a
 * AvisoPublicacionDto en mapping.ts.
 */
export function getApSchema(property: Property): ApSchema {
  const { tipo } = apCategoria(property)
  const required: ApField[] = [
    { id: 'TIPO_OPERACION', name: 'Operación', valueType: 'list', required: true, allowedValues: TIPO_OPERACION },
    { id: 'MONEDA', name: 'Moneda', valueType: 'list', required: true, allowedValues: MONEDA },
    { id: 'CANTIDAD_AMBIENTES', name: 'Ambientes', valueType: 'number', required: true },
  ]
  const recommended: ApField[] = []
  if (SUBTIPOS[tipo]) {
    recommended.push({ id: 'SUBTIPO', name: 'Subtipo', valueType: 'list', required: false, allowedValues: SUBTIPOS[tipo] })
  }
  recommended.push(
    { id: 'CANTIDAD_DORMITORIOS', name: 'Dormitorios', valueType: 'number', required: false },
    { id: 'CANTIDAD_BANOS', name: 'Baños', valueType: 'number', required: false },
    { id: 'CANTIDAD_COCHERAS', name: 'Cocheras', valueType: 'number', required: false },
    { id: 'SUPERFICIE_CUBIERTA', name: 'Superficie cubierta', valueType: 'number_unit', required: false, allowedUnits: ['m²'] },
    { id: 'SUPERFICIE_TOTAL', name: 'Superficie total', valueType: 'number_unit', required: false, allowedUnits: ['m²'] },
    { id: 'ANTIGUEDAD', name: 'Antigüedad (años, 0 = a estrenar)', valueType: 'number', required: false },
    { id: 'EXPENSAS', name: 'Expensas (ARS)', valueType: 'number', required: false },
    { id: 'ESTADO_PROPIEDAD', name: 'Estado', valueType: 'list', required: false, allowedValues: ESTADO_PROPIEDAD },
    { id: 'ORIENTACION', name: 'Orientación', valueType: 'list', required: false, allowedValues: ORIENTACION },
    { id: 'DISPOSICION', name: 'Disposición', valueType: 'list', required: false, allowedValues: DISPOSICION },
  )
  return { categoryId: tipo, required, recommended }
}

/** Valores prellenados desde las columnas de la propiedad (claves = ApField.id). */
export function derivedPrefill(property: Property): Record<string, AttributeOverride> {
  const out: Record<string, AttributeOverride> = {}
  if (property.operation_type) {
    const op = property.operation_type.toLowerCase()
    out.TIPO_OPERACION = { value_id: op === 'alquiler' ? 'ALQUILER' : op === 'temporario' ? 'ALQUILER_TEMPORAL' : 'VENTA' }
  }
  out.MONEDA = { value_id: (property.currency || 'USD').toUpperCase() === 'ARS' ? 'ARS' : 'USD' }
  if (property.rooms) out.CANTIDAD_AMBIENTES = { value_name: String(property.rooms) }
  if (property.bedrooms) out.CANTIDAD_DORMITORIOS = { value_name: String(property.bedrooms) }
  if (property.bathrooms) out.CANTIDAD_BANOS = { value_name: String(property.bathrooms) }
  if (property.garages) out.CANTIDAD_COCHERAS = { value_name: String(property.garages) }
  if (property.covered_area) out.SUPERFICIE_CUBIERTA = { value_name: String(property.covered_area) }
  if (property.total_area) out.SUPERFICIE_TOTAL = { value_name: String(property.total_area) }
  if (property.age != null) out.ANTIGUEDAD = { value_name: String(property.age) }
  if (property.expensas) out.EXPENSAS = { value_name: String(property.expensas) }
  const sub = apCategoria(property).subtipo
  if (sub) out.SUBTIPO = { value_id: sub }
  return out
}

/**
 * Código de aviso ÚNICO en todo el sitio (sección 6.2). Determinístico por propiedad
 * → idempotente para update/baja. Prefijo del IdOrigen de la inmobiliaria (60U6_).
 */
export function apCodigo(property: Property): string {
  return `60U6_${property.id.replace(/-/g, '').slice(0, 12)}`
}
