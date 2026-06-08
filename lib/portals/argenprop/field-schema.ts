import type { Property } from '../types'

/** Mismo shape que ML (CategoryAttribute/AttributeOverride) para que la UI sea idéntica. */
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
  /** Etiqueta de la categoría (tipo de propiedad) que muestra la UI. */
  categoryId: string
  required: ApField[]
  recommended: ApField[]
}

/**
 * CONTRACT ASSUMPTION (tabla TipoPropiedad del spec v4.0 — confirmar en probe):
 * 1=Departamento 2=Depto tipo casa 3=Casa 4=Quinta 5=Cochera 6=Local 7=Hotel
 * 8=Terreno 9=Oficina 10=Campo 11=Fondo Comercio 12=Galpón 13=Negocio Esp 14=Edificio
 */
export const AP_TIPO_PROPIEDAD: Record<string, string> = {
  departamento: '1',
  casa: '3',
  ph: '2', // Depto tipo casa (Argenprop no tiene "PH" propio — confirmar en probe)
  terreno: '8',
  local: '6',
  oficina: '9',
}

/** CONTRACT ASSUMPTION: códigos de operación (confirmar en probe). */
export const AP_TIPO_OPERACION: { id: string; name: string }[] = [
  { id: 'venta', name: 'Venta' },
  { id: 'alquiler', name: 'Alquiler' },
  { id: 'temporario', name: 'Alquiler temporario' },
]

/** CONTRACT ASSUMPTION: códigos de moneda (confirmar en probe). */
export const AP_MONEDA: { id: string; name: string }[] = [
  { id: 'USD', name: 'Dólares' },
  { id: 'ARS', name: 'Pesos' },
]

export function apTipoPropiedad(property: Property): string {
  const t = (property.property_type || 'departamento').toLowerCase()
  return AP_TIPO_PROPIEDAD[t] ?? AP_TIPO_PROPIEDAD.departamento
}

/**
 * Catálogo estático de campos que Argenprop pide. `required` bloquea el publish;
 * `recommended` suma a la calidad (los portales priorizan por calidad).
 * CONTRACT ASSUMPTION: nombres/obligatoriedad reconstruidos del spec v4.0.
 */
export function getApSchema(_property: Property): ApSchema {
  const required: ApField[] = [
    { id: 'TIPO_OPERACION', name: 'Tipo de operación', valueType: 'list', required: true, allowedValues: AP_TIPO_OPERACION },
    { id: 'MONEDA', name: 'Moneda', valueType: 'list', required: true, allowedValues: AP_MONEDA },
    { id: 'AMBIENTES', name: 'Ambientes', valueType: 'number', required: true },
  ]
  const recommended: ApField[] = [
    { id: 'DORMITORIOS', name: 'Dormitorios', valueType: 'number', required: false },
    { id: 'BANOS', name: 'Baños', valueType: 'number', required: false },
    { id: 'COCHERAS', name: 'Cocheras', valueType: 'number', required: false },
    { id: 'SUP_CUBIERTA', name: 'Superficie cubierta', valueType: 'number_unit', required: false, allowedUnits: ['m²'] },
    { id: 'SUP_TOTAL', name: 'Superficie total', valueType: 'number_unit', required: false, allowedUnits: ['m²'] },
    { id: 'ANTIGUEDAD', name: 'Antigüedad (años)', valueType: 'number_unit', required: false, allowedUnits: ['años'] },
    { id: 'EXPENSAS', name: 'Expensas (ARS)', valueType: 'number', required: false },
    { id: 'ORIENTACION', name: 'Orientación', valueType: 'string', required: false },
    { id: 'DISPOSICION', name: 'Disposición', valueType: 'string', required: false },
  ]
  return { categoryId: `TipoPropiedad ${apTipoPropiedad(_property)}`, required, recommended }
}

/** Valores prellenados desde las columnas de la propiedad. Las claves matchean ApField.id. */
export function derivedPrefill(property: Property): Record<string, AttributeOverride> {
  const out: Record<string, AttributeOverride> = {}
  if (property.operation_type) out.TIPO_OPERACION = { value_id: property.operation_type }
  if (property.currency) out.MONEDA = { value_id: property.currency }
  if (property.rooms) out.AMBIENTES = { value_name: String(property.rooms) }
  if (property.bedrooms) out.DORMITORIOS = { value_name: String(property.bedrooms) }
  if (property.bathrooms) out.BANOS = { value_name: String(property.bathrooms) }
  if (property.garages) out.COCHERAS = { value_name: String(property.garages) }
  if (property.covered_area) out.SUP_CUBIERTA = { value_name: String(property.covered_area) }
  if (property.total_area) out.SUP_TOTAL = { value_name: String(property.total_area) }
  if (property.age != null) out.ANTIGUEDAD = { value_name: String(property.age) }
  if (property.expensas) out.EXPENSAS = { value_name: String(property.expensas) }
  return out
}

/**
 * Clave de aviso (aviso.IdOrigen) que generamos nosotros. Determinística por
 * propiedad → idempotente para update/baja sin necesidad de persistir nada.
 * CONTRACT ASSUMPTION: Argenprop acepta string. Si en el probe rechaza no-numérico,
 * cambiar a un entero (ej. parseInt de los primeros hex) o una secuencia Postgres.
 */
export function apAvisoId(property: Property): string {
  return `df-${property.id.replace(/-/g, '').slice(0, 16)}`
}
