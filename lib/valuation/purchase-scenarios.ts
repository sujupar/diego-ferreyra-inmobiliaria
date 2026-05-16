import type {
    PurchaseScenarioId,
    PurchaseScenarioInput,
    PurchaseScenarioLevel,
    PurchaseScenarioResult,
} from './calculator'

const DEFAULT_RATES = {
    stampsPercent: 1.75,
    notaryFeesPercent: 1.0,
    deedExpensesPercent: 1.75,
    buyerCommissionPercent: 4.0,
}

const LEVELS: { level: PurchaseScenarioLevel; label: string; purchaseDiscount: number }[] = [
    { level: 'conservative', label: 'Conservador', purchaseDiscount: 5 },
    { level: 'medium', label: 'Medio', purchaseDiscount: 10 },
    { level: 'aggressive', label: 'Agresivo', purchaseDiscount: 15 },
]

export function buildScenarioId(propertyKey: string, level: PurchaseScenarioLevel): PurchaseScenarioId {
    return `${propertyKey}:${level}`
}

export function parseScenarioId(id: PurchaseScenarioId): { propertyKey: string; level: PurchaseScenarioLevel } {
    const idx = id.indexOf(':')
    if (idx < 0) {
        // Legacy: id literal sin propertyKey ⇒ asumimos prop_0.
        return { propertyKey: 'prop_0', level: id as PurchaseScenarioLevel }
    }
    return {
        propertyKey: id.slice(0, idx),
        level: id.slice(idx + 1) as PurchaseScenarioLevel,
    }
}

/**
 * Genera 3 escenarios prellenados para UNA propiedad de compra.
 *
 * - Conservador: descuento 5% (paga más por la propiedad)
 * - Medio: descuento 10%
 * - Agresivo: descuento 15% (paga menos)
 */
export function buildDefaultScenarios(
    publicationPrice: number,
    propertyKey: string,
    propertyLabel: string,
): PurchaseScenarioInput[] {
    return LEVELS.map(({ level, label, purchaseDiscount }) => ({
        id: buildScenarioId(propertyKey, level),
        level,
        propertyKey,
        propertyLabel,
        label,
        publicationPrice,
        purchaseDiscountPercent: purchaseDiscount,
        deedDiscountPercent: 30,
        rates: { ...DEFAULT_RATES },
    }))
}

/** Calcula resultados financieros para un escenario. */
export function calculateScenario(
    input: PurchaseScenarioInput,
    moneyFromSale: number,
): PurchaseScenarioResult {
    const purchasePrice = Math.round(input.publicationPrice * (1 - input.purchaseDiscountPercent / 100))
    const deedValue = Math.round(purchasePrice * (1 - input.deedDiscountPercent / 100))

    const stampsCost = Math.round(deedValue * (input.rates.stampsPercent / 100))
    const notaryFees = Math.round(deedValue * (input.rates.notaryFeesPercent / 100))
    const deedExpenses = Math.round(deedValue * (input.rates.deedExpensesPercent / 100))
    const buyerCommission = Math.round(purchasePrice * (input.rates.buyerCommissionPercent / 100))

    const totalPurchaseCosts = stampsCost + notaryFees + deedExpenses + buyerCommission
    const totalCostWithPurchase = purchasePrice + totalPurchaseCosts

    return {
        ...input,
        purchasePrice,
        deedValue,
        stampsCost,
        notaryFees,
        deedExpenses,
        buyerCommission,
        totalPurchaseCosts,
        totalCostWithPurchase,
        moneyFromSale,
        remainingMoney: moneyFromSale - totalCostWithPurchase,
    }
}

/** Calcula todos los escenarios pasados. */
export function calculateAllScenarios(
    scenarios: PurchaseScenarioInput[],
    moneyFromSale: number,
): PurchaseScenarioResult[] {
    return scenarios.map(s => calculateScenario(s, moneyFromSale))
}

// Re-export types for convenience
export type { PurchaseScenarioId, PurchaseScenarioLevel }
