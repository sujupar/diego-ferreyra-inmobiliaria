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
// (SaleVisitData). Enums differ between visit and wizard, so we translate:
//
//   disposition:   frente → FRONT, contrafrente → BACK, lateral → LATERAL, interno → INTERNAL
//   quality:       6-level scale (baja..premium) collapsed onto wizard's 5-level
//                  ECONOMIC..EXCELLENT. `media-baja` and `media` both map to
//                  GOOD_ECONOMIC because the wizard has no equivalent mid-low bucket.
//   conservation:  visit uses descriptive tags (a_refaccionar/bueno/muy_bueno/
//                  excelente/a_estrenar). We map each to the closest Ross-Heidecke
//                  state the wizard exposes. `a_refaccionar` → STATE_3
//                  (reparaciones sencillas) is a deliberate middle-ground choice;
//                  the asesor can revise it in the wizard step 5.
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
  // Visit has 6 buckets, wizard has 5. Both `media-baja` and `media` collapse
  // onto GOOD_ECONOMIC (the wizard's neutral middle). `premium` and `alta`
  // collapse onto EXCELLENT/VERY_GOOD respectively.
  switch (q) {
    case 'baja': return 'ECONOMIC'
    case 'media-baja': return 'GOOD_ECONOMIC'
    case 'media': return 'GOOD_ECONOMIC'
    case 'media-alta': return 'GOOD'
    case 'alta': return 'VERY_GOOD'
    case 'premium': return 'EXCELLENT'
    default: return ''
  }
}

function mapConservation(c: ConservationState | null | undefined): ConservationStateType | '' {
  // Visit uses descriptive categories; wizard uses Ross-Heidecke states 1..5
  // with half-steps. We pick the closest integer-state; asesor can refine.
  switch (c) {
    case 'a_estrenar': return 'STATE_1'
    case 'excelente': return 'STATE_1_5'
    case 'muy_bueno': return 'STATE_2'
    case 'bueno': return 'STATE_2_5'
    case 'a_refaccionar': return 'STATE_3'
    default: return ''
  }
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
