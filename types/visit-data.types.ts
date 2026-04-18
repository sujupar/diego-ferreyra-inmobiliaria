// types/visit-data.types.ts
// Snapshot de datos recogidos durante la visita a la propiedad.
// Se persiste en deals.visit_data como JSONB.

export type PropertyTypeVenta = 'departamento' | 'casa' | 'ph' | 'otro'
export type Disposition = 'frente' | 'contrafrente' | 'interno' | 'lateral'
export type Orientation = 'N' | 'S' | 'E' | 'O' | 'NE' | 'NO' | 'SE' | 'SO'
export type Quality = 'baja' | 'media-baja' | 'media' | 'media-alta' | 'alta' | 'premium'
export type ConservationState = 'a_refaccionar' | 'bueno' | 'muy_bueno' | 'excelente' | 'a_estrenar'

export interface SaleVisitData {
  property_type: PropertyTypeVenta
  property_type_other?: string | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_m2: number | null
  semi_covered_m2: number | null
  uncovered_m2: number | null
  total_m2: number | null
  terrain_m2: number | null
  age_years: number | null
  is_refurbished: boolean
  orientation: Orientation | null
  floor: number | null
  total_floors: number | null
  disposition: Disposition | null
  quality: Quality | null
  conservation: ConservationState | null
  construction_features: string[]
  reason_for_sale: string | null
  sale_timeframe: string | null
  strong_points: string[]
  extra_notes: string | null
}

export interface PurchaseVisitData {
  interested_in_purchase: boolean
  property_type_target: PropertyTypeVenta | null
  rooms_target: number | null
  budget_min: number | null
  budget_max: number | null
  budget_currency: 'USD' | 'ARS'
  neighborhoods_target: string[]
  required_features: string[]
  purchase_timeframe: string | null
  extra_notes: string | null
}

export interface VisitDataSnapshot {
  sale: SaleVisitData | null
  purchase: PurchaseVisitData | null
  updated_at: string
}

export const CONSTRUCTION_FEATURES_OPTIONS = [
  'Pisos madera', 'Pisos cerámica', 'Pisos porcelanato', 'Pisos mármol',
  'Carpintería madera', 'Carpintería aluminio', 'Carpintería DVH',
  'Techo losa', 'Techo tejas', 'Cocina integrada', 'Lavadero',
  'Balcón aterrazado', 'Balcón francés', 'Patio', 'Parrilla',
  'Amenities', 'Portero eléctrico', 'Seguridad 24hs',
] as const
