// lib/mapping/visit-to-wizard.ts
//
// Mapper: deal (row from Supabase `deals` table) + deal.visit_data.sale snapshot
// → PropertyWizard's `initialData` prop shape (Partial<PropertyFormData>).
//
// The wizard lives in `components/appraisal/PropertyWizard.tsx`. The form shape
// it accepts is:
//   { address, neighborhood, city,
//     coveredArea, semiCoveredArea, uncoveredArea, totalArea,
//     rooms, bedrooms, bathrooms, garages,
//     floor, totalFloors, age,
//     disposition, quality, conservationState,
//     images }
//
// Source types are defined in `types/visit-data.types.ts`
// (SaleVisitData). As of the Venta/Compra template alignment, Quality and
// ConservationState on the visit side match the wizard's enums 1-to-1. Only
// Disposition still needs translation (Spanish visit tokens → English wizard
// codes):
//
//   disposition:   frente → FRONT, contrafrente → BACK, lateral → LATERAL, interno → INTERNAL
//   quality:       5-level scale aligned with wizard — direct passthrough
//                  (economica → ECONOMIC, buena_economica → GOOD_ECONOMIC,
//                   buena → GOOD, muy_buena → VERY_GOOD, excelente → EXCELLENT).
//   conservation:  9-level Ross-Heidecke scale aligned with wizard — direct
//                  passthrough (estado_1 → STATE_1, estado_1_5 → STATE_1_5, …,
//                   estado_5 → STATE_5). Decision: Option A (extend visit to 9
//                  states matching the wizard) — no data loss, no semantic
//                  collapse; the wizard already exposes all 9 states.
//
// Fields in SaleVisitData that the wizard does not support (property_type,
// terrain_m2, is_refurbished, orientation, construction_features, reason_for_sale,
// sale_timeframe, strong_points, extra_notes) are intentionally skipped — the
// wizard form has no place for them.

import type { SaleVisitData, Disposition, Quality, ConservationState } from '@/types/visit-data.types'
import type { DispositionType, QualityType, ConservationStateType } from '@/lib/valuation/rules'

// Minimal shape of the deal row we need for prefill. We keep it loose (any-ish)
// because the Supabase row type is generated elsewhere and this mapper only
// touches a handful of fields.
export interface DealPrefillSource {
  property_address?: string | null
  neighborhood?: string | null
  visit_data?: { sale?: SaleVisitData | null } | null
}

// Return type mirrors PropertyWizard's PropertyFormData, but every field is
// optional because the wizard accepts Partial<PropertyFormData> as initialData.
export interface WizardInitialData {
  address?: string
  neighborhood?: string
  city?: string
  coveredArea?: number | ''
  semiCoveredArea?: number | ''
  uncoveredArea?: number | ''
  totalArea?: number | ''
  rooms?: number | ''
  bedrooms?: number | ''
  bathrooms?: number | ''
  garages?: number | ''
  floor?: number | ''
  totalFloors?: number | ''
  age?: number | ''
  disposition?: DispositionType | ''
  quality?: QualityType | ''
  conservationState?: ConservationStateType | ''
  images?: string[]
}

function mapDisposition(d: Disposition | null | undefined): DispositionType | '' {
  switch (d) {
    case 'frente': return 'FRONT'
    case 'contrafrente': return 'BACK'
    case 'lateral': return 'LATERAL'
    case 'interno': return 'INTERNAL'
    default: return ''
  }
}

function mapQuality(q: Quality | null | undefined): QualityType | '' {
  if (!q) return ''
  const map: Record<Quality, QualityType> = {
    economica: 'ECONOMIC',
    buena_economica: 'GOOD_ECONOMIC',
    buena: 'GOOD',
    muy_buena: 'VERY_GOOD',
    excelente: 'EXCELLENT',
  }
  return map[q]
}

function mapConservation(c: ConservationState | null | undefined): ConservationStateType | '' {
  if (!c) return ''
  const map: Record<ConservationState, ConservationStateType> = {
    estado_1: 'STATE_1',
    estado_1_5: 'STATE_1_5',
    estado_2: 'STATE_2',
    estado_2_5: 'STATE_2_5',
    estado_3: 'STATE_3',
    estado_3_5: 'STATE_3_5',
    estado_4: 'STATE_4',
    estado_4_5: 'STATE_4_5',
    estado_5: 'STATE_5',
  }
  return map[c]
}

// Convert a nullable number from SaleVisitData to the wizard's `number | ''`
// shape. Null/undefined become '' so the input stays empty instead of showing 0.
function num(n: number | null | undefined): number | '' {
  return typeof n === 'number' && Number.isFinite(n) ? n : ''
}

/**
 * Build the initialData object to hand to PropertyWizard when the asesor is
 * creating a tasación from a deal (dealId query param). Fields are populated
 * from the deal row directly and from the visit_data.sale snapshot when
 * available. Empty/missing fields come through as '' so the wizard renders
 * empty inputs that the asesor can fill.
 */
export function mapDealToWizardInitialData(deal: DealPrefillSource): WizardInitialData {
  const sale = deal.visit_data?.sale ?? null

  const data: WizardInitialData = {
    address: deal.property_address ?? '',
    neighborhood: deal.neighborhood ?? '',
    // City defaults in the wizard; we override only if we have evidence.
  }

  if (!sale) return data

  // Surfaces
  data.coveredArea = num(sale.covered_m2)
  data.semiCoveredArea = num(sale.semi_covered_m2)
  data.uncoveredArea = num(sale.uncovered_m2)
  // totalArea is auto-calculated by the wizard, but we pass the visit value as
  // a seed — it will be overwritten if the sum of parts differs.
  data.totalArea = num(sale.total_m2)

  // Spaces
  data.rooms = num(sale.rooms)
  data.bedrooms = num(sale.bedrooms)
  data.bathrooms = num(sale.bathrooms)
  data.garages = num(sale.garages)

  // Building
  data.floor = num(sale.floor)
  data.totalFloors = num(sale.total_floors)
  data.age = num(sale.age_years)

  // Characteristics (enum translations — see header comment for rationale)
  data.disposition = mapDisposition(sale.disposition)
  data.quality = mapQuality(sale.quality)
  data.conservationState = mapConservation(sale.conservation)

  return data
}

/**
 * True if the deal has a visit_data.sale snapshot with at least one mapped
 * field populated. Used by the new-appraisal page to decide whether to show
 * the "prefill active" banner.
 */
export function hasSaleVisitPrefill(deal: DealPrefillSource): boolean {
  const sale = deal.visit_data?.sale
  if (!sale) return false
  return (
    sale.property_type != null ||
    sale.rooms != null ||
    sale.covered_m2 != null ||
    sale.disposition != null ||
    sale.quality != null ||
    sale.conservation != null ||
    sale.age_years != null
  )
}
