import type { Property } from '../types'
import type { AttributeOverride } from './category-attributes'

/** Atributos derivables de los campos de la propiedad, para prellenar el schema de ML. */
export function derivedPrefill(property: Property): Record<string, AttributeOverride> {
  const out: Record<string, AttributeOverride> = {}
  if (property.rooms) out.ROOMS = { value_name: String(property.rooms) }
  if (property.bedrooms) out.BEDROOMS = { value_name: String(property.bedrooms) }
  if (property.bathrooms) out.FULL_BATHROOMS = { value_name: String(property.bathrooms) }
  if (property.garages) out.PARKING_LOTS = { value_name: String(property.garages) }
  // number_unit: ML exige unidad explícita (sino rechaza el aviso). Mismo formato que derivedAttributes.
  if (property.covered_area) out.COVERED_AREA = { value_name: `${property.covered_area} m²` }
  if (property.total_area) out.TOTAL_AREA = { value_name: `${property.total_area} m²` }
  if (property.expensas) out.MAINTENANCE_FEE = { value_name: `${property.expensas} ARS` }
  if (property.age != null) out.PROPERTY_AGE = { value_name: property.age === 0 ? 'A estrenar' : `${property.age} años` }
  if (property.floor != null) out.FLOORS = { value_name: String(property.floor) }
  return out
}
