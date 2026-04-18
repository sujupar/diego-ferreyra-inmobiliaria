// types/visit-data.types.ts
// Snapshot de datos recogidos durante la visita a la propiedad.
// Se persiste en deals.visit_data como JSONB.

export type PropertyTypeVenta = 'departamento' | 'casa' | 'ph' | 'otro'
export type Disposition = 'frente' | 'contrafrente' | 'interno' | 'lateral'
export type Orientation = 'N' | 'S' | 'E' | 'O' | 'NE' | 'NO' | 'SE' | 'SO'
export type Quality = 'economica' | 'buena_economica' | 'buena' | 'muy_buena' | 'excelente'
export type ConservationState = 'estado_1' | 'estado_1_5' | 'estado_2' | 'estado_2_5' | 'estado_3' | 'estado_3_5' | 'estado_4' | 'estado_4_5' | 'estado_5'

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
  // Características de la propiedad que BUSCA comprar
  property_type_target: PropertyTypeVenta | null
  property_type_other?: string | null
  neighborhood_target: string | null              // barrio singular (era array)
  rooms_target: number | null
  bedrooms_target: number | null
  bathrooms_target: number | null
  garages_target: number | null
  covered_m2_target: number | null
  semi_covered_m2_target: number | null
  uncovered_m2_target: number | null
  total_m2_target: number | null
  terrain_m2_target: number | null
  age_years_target: number | null
  is_refurbished_target: boolean
  orientation_target: Orientation | null
  floor_target: number | null
  total_floors_target: number | null
  disposition_target: Disposition | null
  quality_target: Quality | null
  conservation_target: ConservationState | null
  construction_features_target: string[]
  // Bloque impositivo
  stamps_amount: number | null                    // IMP Sellos (monto absoluto)
  fees_amount: number | null                      // Honorarios (monto absoluto)
  budget_min: number | null
  budget_max: number | null
  budget_currency: 'USD' | 'ARS'
  purchase_timeframe: string | null
  required_features: string[]
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
