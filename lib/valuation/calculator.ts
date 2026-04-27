import {
    VALUATION_RULES,
    DispositionType,
    QualityType,
    ConservationStateType,
    calculateAgeStateCoefficient
} from './rules'

// Extended property features for valuation
export interface ValuationFeatures {
    coveredArea?: number           // Superficie Cubierta (100%)
    semiCoveredArea?: number       // Semi Cubierta (50%)
    uncoveredArea?: number         // Superficie Descubierta (50%)
    totalArea?: number             // Solo referencia
    floor?: number
    totalFloors?: number
    age?: number
    disposition?: DispositionType
    quality?: QualityType
    conservationState?: ConservationStateType
    locationCoefficient?: number   // J - Coeficiente de Ubicación (default 1.0)
    bedrooms?: number
    bathrooms?: number
    garages?: number
    rooms?: number                 // Ambientes
    views?: number | null          // Visualizaciones (solo Zonaprop)
    publishedDate?: string | null  // "Publicado hace X días"
}

/**
 * Get floor coefficient based on Excel formula:
 * IF(I="PB", 0.9, IF(I="PBP", 1, IF(I=1, 0.85, IF(I=2, 0.93, IF(I<=4, 1, IF(I<=6, 1.05, IF(I<=8, 1.1, IF(I>8, 1.15, 0))))))))
 */
function getFloorCoefficient(floor: number, totalFloors: number | null): number {
    if (floor === 0) return VALUATION_RULES.FLOOR_COEFFICIENTS.GROUND_FLOOR // 0.90
    if (floor === 1) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_1 // 0.85
    if (floor === 2) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_2 // 0.93
    if (floor >= 3 && floor <= 4) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_3_4 // 1.00
    if (floor >= 5 && floor <= 6) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_5_6 // 1.05
    if (floor >= 7 && floor <= 8) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_7_8 // 1.10
    if (floor > 8) return VALUATION_RULES.FLOOR_COEFFICIENTS.FLOOR_HIGH // 1.15

    return 1.0
}

/**
 * Get disposition coefficient based on Excel formula:
 * IF(I="Fte", 1, IF(I="Cta Fte", 0.95, IF(I="Int", 0.9, IF(I="Lat", 0.93, 0))))
 */
function getDispositionCoefficient(disposition?: DispositionType): number {
    if (!disposition) return 1.0
    return VALUATION_RULES.DISPOSITION_COEFFICIENTS[disposition] || 1.0
}

/**
 * Get quality coefficient
 */
export function getQualityCoefficient(quality?: QualityType): number {
    if (!quality) return VALUATION_RULES.QUALITY_COEFFICIENTS.GOOD_ECONOMIC
    return VALUATION_RULES.QUALITY_COEFFICIENTS[quality] || 1.0
}

/**
 * Calculate age factor using Ross-Heidecke method
 * Life span is always 70 years.
 */
function calculateAgeFactor(
    age: number,
    conservationState: ConservationStateType = 'STATE_2',
): number {
    return calculateAgeStateCoefficient(age, conservationState, 70)
}

/**
 * Calculate Homogenized Surface
 * M2 Homologado = Cubierta (100%) + Semi-Cubierta (50%) + Descubierta (50%)
 * Excel: G = (C) + (D*0.5) + (E*0.5)
 * Example: 48m² cubiertos + 0m² semi + 12m² descubiertos = 48 + 0 + 6 = 54m² homologados
 */
export function calculateHomogenizedSurface(features: ValuationFeatures): number {
    const covered = features.coveredArea || 0
    const semiCovered = features.semiCoveredArea || 0
    const uncovered = features.uncoveredArea || 0

    return (covered * VALUATION_RULES.SURFACE_COEFFICIENTS.COVERED) +
        (semiCovered * VALUATION_RULES.SURFACE_COEFFICIENTS.SEMI_COVERED) +
        (uncovered * VALUATION_RULES.SURFACE_COEFFICIENTS.UNCOVERED)
}

// Extended property for valuation
export interface ValuationProperty {
    price?: number | null
    currency?: string | null
    title?: string
    location?: string
    images?: string[]
    description?: string
    url?: string
    features: ValuationFeatures
}

export interface ExpenseRates {
    saleDiscountPercent?: number      // Default 5 (sale = publication * 0.95)
    deedDiscountPercent?: number      // Default 30 (deed = sale * 0.70)
    stampsPercent?: number            // Default 1.35
    deedExpensesPercent?: number      // Default 1.5
    agencyFeesPercent?: number        // Default 3
}

export interface PurchaseExpenseRates {
    purchaseDiscountPercent?: number   // Default 0 (configurable)
    deedDiscountPercent?: number       // Default 30
    stampsPercent?: number             // Sellos: 1.75%
    notaryFeesPercent?: number         // Honorarios Escribano: 1%
    deedExpensesPercent?: number       // Gastos Escritura: 1.75%
    buyerCommissionPercent?: number    // Honorarios Inmobiliaria: 4%
}

export interface PurchaseResult {
    selectedPropertyTitle: string
    publicationPrice: number
    purchasePrice: number
    deedValue: number
    stampsCost: number
    notaryFees: number
    deedExpenses: number
    buyerCommission: number
    totalPurchaseCosts: number
    totalCostWithPurchase: number
    moneyFromSale: number
    moneyNeededForPurchase: number
    remainingMoney: number
    purchaseExpenseRates: Required<PurchaseExpenseRates>
}

export type PurchaseScenarioId = 'conservative' | 'medium' | 'aggressive'

export interface PurchaseScenarioRates {
    stampsPercent: number
    notaryFeesPercent: number
    deedExpensesPercent: number
    buyerCommissionPercent: number
}

export interface PurchaseScenarioInput {
    id: PurchaseScenarioId
    label: string
    publicationPrice: number
    purchaseDiscountPercent: number
    deedDiscountPercent: number
    rates: PurchaseScenarioRates
}

export interface PurchaseScenarioResult extends PurchaseScenarioInput {
    purchasePrice: number
    deedValue: number
    stampsCost: number
    notaryFees: number
    deedExpenses: number
    buyerCommission: number
    totalPurchaseCosts: number
    totalCostWithPurchase: number
    moneyFromSale: number
    remainingMoney: number
}

export interface ValuationInput {
    subject: ValuationProperty
    comparables: ValuationProperty[]
    expenseRates?: ExpenseRates
}

export interface ComparableAnalysis {
    property: ValuationProperty
    originalPriceM2: number
    homogenizedSurface: number
    locationCoefficient: number      // J - Ubicación
    floorCoefficient: number         // K3 - Piso
    dispositionCoefficient: number   // K4 - Disposición
    qualityCoefficient: number       // M - Calidad Constructiva
    ageCoefficient: number           // L/W - Edad Estado (Ross-Heidecke)
    totalCoefficient: number         // N = J × K3 × K4 × L × M
    adjustedPriceM2: number          // O = H / N
}

export interface ValuationResult {
    subjectSurface: number
    subjectLocationCoef: number
    subjectFloorCoef: number
    subjectDispositionCoef: number
    subjectQualityCoef: number
    subjectAgeCoef: number
    subjectTotalCoef: number
    comparableAnalysis: ComparableAnalysis[]
    averagePriceM2: number           // O25 = AVERAGE(O values)
    subjectPriceM2: number           // H3 = O25 × N3
    finalValue: number               // F3 = G3 × H3
    publicationPrice: number         // ROUND(F3, -3) → nearest 1,000
    noSaleZonePrice: number          // Zona de No Venta = Publicación × 1.05
    // Cost calculations
    saleValue: number                // Valor de Venta = Publicación × 0.95
    deedValue: number                // Valor de Escritura = Venta × 0.70
    stampsCost: number               // Sellos = Escritura × 1.35%
    deedExpenses: number             // Gastos de Escritura = Venta × 1.5%
    agencyFees: number               // Honorarios Inmobiliaria = Venta × 3%
    totalExpenses: number            // Total gastos = sellos + escritura + honorarios
    moneyInHand: number              // Dinero en mano = venta - total gastos
    currency: string
    expenseRates: Required<ExpenseRates>  // Actual rates used (with defaults)
    purchaseResult?: PurchaseResult       // Present when purchase properties selected
    /** Escenarios de compra calculados (Conservador / Medio / Agresivo). */
    purchaseScenarios?: PurchaseScenarioResult[]
    /** IDs seleccionados para mostrar en el PDF. */
    selectedScenarioIds?: PurchaseScenarioId[]
}

/**
 * Main valuation calculation function
 * Following Excel logic EXACTLY:
 *
 * For each comparable:
 *   G = Cubierta + (SemiCubierta × 0.5) + (Descubierta × 0.5)
 *   H = F / G (Precio / M2 Homologados = Precio por m² original)
 *   N = J × K_piso × K_disp × L × M (Total = Ubic × Piso × Disp × Edad × Calidad)
 *   O = H / N (Precio ajustado por m²)
 *
 * Then:
 *   O25 = AVERAGE(all O values)
 *   H3 = O25 × N3 (Subject $/m² = Average × Subject Total Coefficient)
 *   F3 = G3 × H3 (Final Value = Subject M² × Subject $/m²)
 *   Precio Publicación = ROUND(F3, -3) (rounded to nearest 1,000)
 *   Zona de No Venta = Publicación × 1.05
 *
 * Cost calculations:
 *   Valor de Venta = Publicación × 0.95
 *   Valor de Escritura = Venta × 0.70
 *   Sellos = Escritura × 1.35%
 *   Gastos de Escritura = Venta × 1.5%
 *   Honorarios Inmobiliaria = Venta × 3%
 *   Dinero en mano = Venta - (Sellos + Gastos Escritura + Honorarios)
 */
export function calculateValuation({ subject, comparables, expenseRates }: ValuationInput): ValuationResult | null {
    if (!comparables.length || !subject) return null

    // Calculate Homogenized Surface of Subject (G3)
    const subjectSurface = calculateHomogenizedSurface(subject.features)
    if (subjectSurface === 0) return null

    // Subject coefficients — aplicar coeficientes según selección del usuario
    const subjectLocationCoef = subject.features.locationCoefficient ?? 1.0
    const subjectFloorCoef = getFloorCoefficient(
        subject.features.floor || 0,
        subject.features.totalFloors || null
    )
    const subjectDispositionCoef = getDispositionCoefficient(subject.features.disposition)
    const subjectQualityCoef = getQualityCoefficient(subject.features.quality)
    const subjectAgeCoef = calculateAgeFactor(
        subject.features.age || 0,
        subject.features.conservationState || 'STATE_2',
    )
    // N3 = J × K_piso × K_disp × W × M
    const subjectTotalCoef = subjectLocationCoef * subjectFloorCoef * subjectDispositionCoef * subjectQualityCoef * subjectAgeCoef

    // Process Comparables
    const comparableAnalysis: ComparableAnalysis[] = []

    for (const comp of comparables) {
        const price = comp.price || 0
        if (price === 0) continue

        const compSurface = calculateHomogenizedSurface(comp.features)
        if (compSurface === 0) continue

        // H = Precio / M² Homologados
        const originalPriceM2 = price / compSurface

        // Calculate comparable coefficients
        const locationCoefficient = comp.features.locationCoefficient ?? 1.0
        const floorCoefficient = getFloorCoefficient(
            comp.features.floor || 0,
            comp.features.totalFloors || null
        )
        const dispositionCoefficient = getDispositionCoefficient(comp.features.disposition)
        const qualityCoefficient = getQualityCoefficient(comp.features.quality)
        const ageCoefficient = calculateAgeFactor(
            comp.features.age || 0,
            comp.features.conservationState || 'STATE_2',
        )

        // N = J × K_piso × K_disp × W × M (Total coefficient)
        const totalCoefficient = locationCoefficient * floorCoefficient * dispositionCoefficient * qualityCoefficient * ageCoefficient

        // O = H / N (Precio por m² ajustado)
        const adjustedPriceM2 = originalPriceM2 / totalCoefficient

        comparableAnalysis.push({
            property: comp,
            originalPriceM2,
            homogenizedSurface: compSurface,
            locationCoefficient,
            floorCoefficient,
            dispositionCoefficient,
            qualityCoefficient,
            ageCoefficient,
            totalCoefficient,
            adjustedPriceM2
        })
    }

    if (comparableAnalysis.length === 0) return null

    // O25 = AVERAGE(all O values)
    const averagePriceM2 = comparableAnalysis.reduce((sum, c) => sum + c.adjustedPriceM2, 0) / comparableAnalysis.length

    // H3 = O25 × N3 (Subject's $/m² = Average × Subject's Total Coefficient)
    const subjectPriceM2 = averagePriceM2 * subjectTotalCoef

    // F3 = G3 × H3 (Final Value = Subject M² × Subject $/m²)
    const finalValue = subjectSurface * subjectPriceM2

    // Precio de Publicación = redondeado al millar más cercano
    const publicationPrice = Math.round(finalValue / 1000) * 1000

    // Zona de No Venta = Publicación × 1.05 (5% por encima)
    const noSaleZonePrice = Math.round((publicationPrice * 1.05) / 1000) * 1000

    // ─── Cost calculations (configurable rates) ───
    const rates: Required<ExpenseRates> = {
        saleDiscountPercent: expenseRates?.saleDiscountPercent ?? 5,
        deedDiscountPercent: expenseRates?.deedDiscountPercent ?? 30,
        stampsPercent: expenseRates?.stampsPercent ?? 1.35,
        deedExpensesPercent: expenseRates?.deedExpensesPercent ?? 1.5,
        agencyFeesPercent: expenseRates?.agencyFeesPercent ?? 3,
    }
    const saleValue = Math.round(publicationPrice * (1 - rates.saleDiscountPercent / 100))
    const deedValue = Math.round(saleValue * (1 - rates.deedDiscountPercent / 100))
    const stampsCost = Math.round(deedValue * (rates.stampsPercent / 100))
    const deedExpenses = Math.round(saleValue * (rates.deedExpensesPercent / 100))
    const agencyFees = Math.round(saleValue * (rates.agencyFeesPercent / 100))
    const totalExpenses = stampsCost + deedExpenses + agencyFees
    const moneyInHand = saleValue - totalExpenses

    // Determine currency
    const currency = comparables.find(c => c.currency)?.currency || 'USD'

    return {
        subjectSurface,
        subjectLocationCoef,
        subjectFloorCoef,
        subjectDispositionCoef,
        subjectQualityCoef,
        subjectAgeCoef,
        subjectTotalCoef,
        comparableAnalysis,
        averagePriceM2,
        subjectPriceM2,
        finalValue,
        publicationPrice,
        noSaleZonePrice,
        saleValue,
        deedValue,
        stampsCost,
        deedExpenses,
        agencyFees,
        totalExpenses,
        moneyInHand,
        currency,
        expenseRates: rates,
    }
}

/**
 * Calculate purchase costs for a selected property
 *
 * Based on the reference PDF (Pichincha 105):
 *   Valor de Publicación → Valor de Compra (with optional discount) → Valor de Escritura
 *   Gastos de Compra:
 *     - Sellos 1.75%
 *     - Honorarios de Escribano 1%
 *     - Gastos de Escritura 1.75%
 *     - Honorarios Inmobiliaria 4%
 */
export function calculatePurchaseCosts(
    purchasePublicationPrice: number,
    purchaseTitle: string,
    moneyFromSale: number,
    rates?: PurchaseExpenseRates,
): PurchaseResult {
    const r: Required<PurchaseExpenseRates> = {
        purchaseDiscountPercent: rates?.purchaseDiscountPercent ?? 0,
        deedDiscountPercent: rates?.deedDiscountPercent ?? 30,
        stampsPercent: rates?.stampsPercent ?? 1.75,
        notaryFeesPercent: rates?.notaryFeesPercent ?? 1,
        deedExpensesPercent: rates?.deedExpensesPercent ?? 1.75,
        buyerCommissionPercent: rates?.buyerCommissionPercent ?? 4,
    }

    const purchasePrice = Math.round(purchasePublicationPrice * (1 - r.purchaseDiscountPercent / 100))
    const deedValue = Math.round(purchasePrice * (1 - r.deedDiscountPercent / 100))

    // Gastos de compra - based on reference PDF table
    const stampsCost = Math.round(deedValue * (r.stampsPercent / 100))
    const notaryFees = Math.round(deedValue * (r.notaryFeesPercent / 100))
    const deedExpenses = Math.round(deedValue * (r.deedExpensesPercent / 100))
    const buyerCommission = Math.round(purchasePrice * (r.buyerCommissionPercent / 100))
    const totalPurchaseCosts = stampsCost + notaryFees + deedExpenses + buyerCommission
    const totalCostWithPurchase = purchasePrice + totalPurchaseCosts

    return {
        selectedPropertyTitle: purchaseTitle,
        publicationPrice: purchasePublicationPrice,
        purchasePrice,
        deedValue,
        stampsCost,
        notaryFees,
        deedExpenses,
        buyerCommission,
        totalPurchaseCosts,
        totalCostWithPurchase,
        moneyFromSale,
        moneyNeededForPurchase: totalCostWithPurchase,
        remainingMoney: moneyFromSale - totalCostWithPurchase,
        purchaseExpenseRates: r,
    }
}
