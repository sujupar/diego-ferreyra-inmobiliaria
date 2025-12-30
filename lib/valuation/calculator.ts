import {
    VALUATION_RULES,
    DispositionType,
    QualityType,
    ConservationStateType,
    PropertyType
} from './rules'
import { ScrapedProperty } from '../scraper/types'

// Extended property features for valuation
export interface ValuationFeatures {
    coveredArea?: number
    totalArea?: number
    floor?: number
    totalFloors?: number
    age?: number
    disposition?: DispositionType
    quality?: QualityType
    conservationState?: ConservationStateType
    propertyType?: PropertyType
    bedrooms?: number
    bathrooms?: number
    garages?: number
}

// Helper to get floor coefficient
// Based on Excel formula:
// IF(I="PB", 0.9, IF(I="PBP", 1, IF(I=1, 0.9, IF(I=2, 0.93, IF(I<=4, 1, IF(I<=6, 1.05, IF(I<=8, 1.1, IF(I>8, 1.15, 0))))))))
function getFloorCoefficient(floor: number, totalFloors: number | null): number {
    // PB (Planta Baja) = 0
    if (floor === 0) return VALUATION_RULES.FLOOR_COEFFICIENTS.GROUND_FLOOR // 0.90
    if (floor === 1) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_1 // 0.90
    if (floor === 2) return 0.93 // Excel uses 0.93 for floor 2
    if (floor >= 3 && floor <= 4) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_3_4 // 1.00
    if (floor >= 5 && floor <= 6) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_5_6 // 1.05
    if (floor >= 7 && floor <= 8) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_7_8 // 1.10
    if (floor > 8) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_HIGH // 1.15

    return 1.0
}

// Helper to get disposition coefficient
// Based on Excel: IF(I="Fte", 1, IF(I="Cta Fte", 0.95, IF(I="Int", 0.9, IF(I="Lat", 0.93, 0))))
function getDispositionCoefficient(disposition?: DispositionType): number {
    if (!disposition) return 1.0
    return VALUATION_RULES.DISPOSITION_COEFFICIENTS[disposition] || 1.0
}

// Helper to get quality coefficient
function getQualityCoefficient(quality?: QualityType): number {
    if (!quality) return VALUATION_RULES.QUALITY_COEFFICIENTS.GOOD_ECONOMIC
    return VALUATION_RULES.QUALITY_COEFFICIENTS[quality] || 1.0
}

// Get lifespan based on property type (default 70 years as per Excel)
function getLifespan(propertyType?: PropertyType): number {
    if (!propertyType) return 70 // Excel uses 70 as default
    return VALUATION_RULES.LIFE_SPAN[propertyType] || 70
}

// Calculate age factor using Ross-Heidecke method
// Based on Excel formulas:
// S: MIN(99, IF(Q<=69, ROUND(100*Q/70,0), 99)) - % of life
// U: VLOOKUP(S, cof!$A$3:$J$103, MATCH(T, cof!$A$3:$J$3, 0), 0) - K value from table
// V: U/100 - convert to decimal
// W: 1-(V/2) - THE KEY FORMULA for age factor
function calculateAgeFactor(
    age: number,
    conservationState: ConservationStateType = 'STATE_2',
    propertyType?: PropertyType
): number {
    const lifespan = getLifespan(propertyType)

    // Calculate percentage of life used (round to nearest 10, max 99)
    // Excel: MIN(99, IF(Q<=69, ROUND(100*Q/70,0), 99))
    let lifePercentage = Math.round((age / lifespan) * 100)
    lifePercentage = Math.min(99, lifePercentage)

    // Round to nearest 10 for table lookup
    const tableKey = Math.min(100, Math.round(lifePercentage / 10) * 10)

    // Get state index (0-4)
    const stateIndex = parseInt(conservationState.replace('STATE_', '')) - 1

    // Get K value from table
    const kValues = VALUATION_RULES.ROSS_HEIDECKE_K[tableKey as keyof typeof VALUATION_RULES.ROSS_HEIDECKE_K]
    if (!kValues) return 1.0 // Default to no adjustment

    const k = kValues[stateIndex] || 0

    // Excel formula: W = 1 - (K / 2)
    // This gives values between 0.5 (worst) and 1.0 (best)
    const ageFactor = 1 - (k / 2)

    return ageFactor
}

// Calculate Homogenized Surface
// Sup. Homogenizada = Cubierta + (Semicubierta * 0.5) + (Balcón * 0.5) + (Descubierta * 0.5)
export function calculateHomogenizedSurface(features: ValuationFeatures): number {
    const covered = features.coveredArea || 0
    const total = features.totalArea || covered
    const extra = Math.max(0, total - covered)

    // We treat 'extra' as 50% value (could be balcony or patio)
    return covered * VALUATION_RULES.SURFACE_COEFFICIENTS.COVERED +
        extra * VALUATION_RULES.SURFACE_COEFFICIENTS.UNCOVERED
}

// Extended property for valuation
export interface ValuationProperty {
    price?: number | null
    currency?: string | null
    title?: string
    location?: string
    images?: string[]
    description?: string
    url?: string  // URL to the property listing
    features: ValuationFeatures
}

export interface ValuationInput {
    subject: ValuationProperty
    comparables: ValuationProperty[]
}

export interface ComparableAnalysis {
    property: ValuationProperty
    originalPriceM2: number
    homogenizedSurface: number
    floorFactor: number
    dispositionFactor: number
    qualityFactor: number
    ageFactor: number
    totalAdjustment: number
    adjustedPriceM2: number
}

export interface ValuationResult {
    subjectSurface: number
    comparableAnalysis: ComparableAnalysis[]
    averagePriceM2: number
    finalValue: number
    currency: string
}

export function calculateValuation({ subject, comparables }: ValuationInput): ValuationResult | null {
    if (!comparables.length || !subject) return null

    // 1. Calculate Homogenized Surface of Subject
    const subjectSurface = calculateHomogenizedSurface(subject.features)
    if (subjectSurface === 0) return null

    // Get subject coefficients
    const subjectFloorCoef = getFloorCoefficient(
        subject.features.floor || 0,
        subject.features.totalFloors || null
    )
    const subjectDispositionCoef = getDispositionCoefficient(subject.features.disposition)
    const subjectQualityCoef = getQualityCoefficient(subject.features.quality)
    const subjectAgeFactor = calculateAgeFactor(
        subject.features.age || 0,
        subject.features.conservationState,
        subject.features.propertyType
    )

    // 2. Process Comparables
    const comparableAnalysis: ComparableAnalysis[] = []

    for (const comp of comparables) {
        const price = comp.price || 0
        if (price === 0) continue

        const compSurface = calculateHomogenizedSurface(comp.features)
        if (compSurface === 0) continue

        const originalPriceM2 = price / compSurface

        // Calculate comparable coefficients
        const compFloorCoef = getFloorCoefficient(
            comp.features.floor || 0,
            comp.features.totalFloors || null
        )
        const compDispositionCoef = getDispositionCoefficient(comp.features.disposition)
        const compQualityCoef = getQualityCoefficient(comp.features.quality)
        const compAgeFactor = calculateAgeFactor(
            comp.features.age || 0,
            comp.features.conservationState,
            comp.features.propertyType
        )

        // Calculate the total coefficient for the comparable
        // Excel: N = Quality * Floor * Disposition * AgeFactor
        const compTotalCoef = compQualityCoef * compFloorCoef * compDispositionCoef * compAgeFactor

        // Calculate the total coefficient for the subject
        const subjectTotalCoef = subjectQualityCoef * subjectFloorCoef * subjectDispositionCoef * subjectAgeFactor

        // Calculate individual adjustment factors (for display purposes)
        // These show how much we're adjusting from comparable to subject
        const floorFactor = subjectFloorCoef / compFloorCoef
        const dispositionFactor = subjectDispositionCoef / compDispositionCoef
        const qualityFactor = subjectQualityCoef / compQualityCoef
        const ageFactor = subjectAgeFactor / compAgeFactor

        // Total adjustment = Subject coefficient / Comparable coefficient
        const totalAdjustment = subjectTotalCoef / compTotalCoef

        // Adjusted price per m² = Original price / Comparable coefficient * Subject coefficient
        // Or equivalently: Original price * (Subject coef / Comparable coef)
        // But following Excel logic: O = H / N (price/m2 divided by total coefficient)
        // Then multiply by subject coefficient to get adjusted price for subject
        const adjustedPriceM2 = (originalPriceM2 / compTotalCoef) * subjectTotalCoef

        comparableAnalysis.push({
            property: comp,
            originalPriceM2,
            homogenizedSurface: compSurface,
            floorFactor,
            dispositionFactor,
            qualityFactor,
            ageFactor,
            totalAdjustment,
            adjustedPriceM2
        })
    }

    if (comparableAnalysis.length === 0) return null

    // 3. Calculate average adjusted price per m2
    const averagePriceM2 = comparableAnalysis.reduce((sum, c) => sum + c.adjustedPriceM2, 0) / comparableAnalysis.length

    // 4. Final Value
    const finalValue = Math.round(averagePriceM2 * subjectSurface)

    // Determine currency (use first comparable's currency or default)
    const currency = comparables.find(c => c.currency)?.currency || 'USD'

    return {
        subjectSurface,
        comparableAnalysis,
        averagePriceM2,
        finalValue,
        currency
    }
}
