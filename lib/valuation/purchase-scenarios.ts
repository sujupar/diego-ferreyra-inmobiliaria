import type {
    PurchaseScenarioId,
    PurchaseScenarioInput,
    PurchaseScenarioResult,
} from './calculator'

const DEFAULT_RATES = {
    stampsPercent: 1.75,
    notaryFeesPercent: 1.0,
    deedExpensesPercent: 1.75,
    buyerCommissionPercent: 4.0,
}

/**
 * Genera 3 escenarios prellenados a partir de un precio base de publicación.
 *
 * - Conservador: descuento 5% (paga más por la propiedad)
 * - Medio: descuento 10%
 * - Agresivo: descuento 15% (paga menos)
 */
export function buildDefaultScenarios(publicationPrice: number): PurchaseScenarioInput[] {
    return [
        {
            id: 'conservative',
            label: 'Conservador',
            publicationPrice,
            purchaseDiscountPercent: 5,
            deedDiscountPercent: 30,
            rates: { ...DEFAULT_RATES },
        },
        {
            id: 'medium',
            label: 'Medio',
            publicationPrice,
            purchaseDiscountPercent: 10,
            deedDiscountPercent: 30,
            rates: { ...DEFAULT_RATES },
        },
        {
            id: 'aggressive',
            label: 'Agresivo',
            publicationPrice,
            purchaseDiscountPercent: 15,
            deedDiscountPercent: 30,
            rates: { ...DEFAULT_RATES },
        },
    ]
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

/** Calcula los 3 escenarios. */
export function calculateAllScenarios(
    scenarios: PurchaseScenarioInput[],
    moneyFromSale: number,
): PurchaseScenarioResult[] {
    return scenarios.map(s => calculateScenario(s, moneyFromSale))
}

// Re-export type for convenience
export type { PurchaseScenarioId }
