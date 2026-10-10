/**
 * Edición en línea de la ficha de una tasación (`/appraisals/[id]`), versión
 * clásica. Auditoría del 2026-10-03 (B3): cada handler de la ficha armaba el
 * recálculo desde las filas TAL COMO SE CARGARON al abrir, que nunca se
 * actualizaban tras guardar. Editar el comparable 1 y después el 2 mandaba al
 * servidor el 1 ORIGINAL: la segunda edición deshacía la primera. Además el
 * resultado nuevo no copiaba la parte del propietario y dejaba los escenarios
 * de compra con el dinero en mano viejo.
 *
 * Esta función recibe el estado VIGENTE, aplica UN cambio y devuelve el estado
 * nuevo completo (filas + sujeto + resultado), pasando por `completarValuacion`
 * igual que el asistente. La ficha guarda ese estado y la próxima edición
 * parte de ahí.
 */
import {
    calculateHomogenizedSurface,
    calculateValuation,
    type ExpenseRates,
    type ValuationFeatures,
    type ValuationProperty,
    type ValuationResult,
} from './calculator'
import { completarValuacion } from './completar-valuacion'
import { entradaDeEscenario } from './purchase-scenarios'

/** Lo mínimo de una fila de `appraisal_comparables` que hace falta acá. */
export interface FilaFicha {
    title: string | null
    location: string | null
    price: number | null
    currency: string | null
    features: ValuationFeatures
    analysis: { propertyType?: string } | null
    sort_order: number
}

export interface EstadoFicha<T extends FilaFicha> {
    sujeto: ValuationProperty
    filas: T[]
    resultado: ValuationResult
}

export type CambioFicha =
    | { tipo: 'sujeto'; features: ValuationFeatures }
    /** `indice` indexa `resultado.comparableAnalysis` (lo que muestra el informe). */
    | { tipo: 'comparable'; indice: number; features: ValuationFeatures }
    | { tipo: 'tasas'; tasas: Partial<ExpenseRates> }

const esNormal = (f: FilaFicha) =>
    f.analysis?.propertyType !== 'overpriced' && f.analysis?.propertyType !== 'purchase'

/** Mismo filtro que `calculateValuation`: sin precio o sin superficie, no entra. */
const entraAlCalculo = (f: FilaFicha) =>
    (f.price ?? 0) > 0 && calculateHomogenizedSurface(f.features ?? {}) > 0

/** Posiciones (en `filas`) de los comparables normales, en el orden del cálculo. */
function posicionesNormales(filas: FilaFicha[]): number[] {
    return filas
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => esNormal(f))
        .sort((a, b) => a.f.sort_order - b.f.sort_order)
        .map(({ i }) => i)
}

export function recalcularFicha<T extends FilaFicha>(
    estado: EstadoFicha<T>,
    cambio: CambioFicha,
): EstadoFicha<T> | null {
    const previo = estado.resultado
    let filas = estado.filas
    let sujeto = estado.sujeto
    let tasas: ExpenseRates | undefined = previo?.expenseRates

    if (cambio.tipo === 'sujeto') {
        sujeto = { ...sujeto, features: cambio.features }
    } else if (cambio.tipo === 'comparable') {
        // El informe solo lista los comparables que ENTRARON al cálculo: si uno
        // quedó afuera (sin precio), el índice del informe no es el de la fila.
        const enCalculo = posicionesNormales(filas).filter(i => entraAlCalculo(filas[i]))
        const posicion = enCalculo[cambio.indice]
        if (posicion === undefined) return null
        filas = filas.map((f, i) => (i === posicion ? { ...f, features: cambio.features } : f))
    } else {
        tasas = { ...previo?.expenseRates, ...cambio.tasas }
    }

    const base = calculateValuation({
        subject: sujeto,
        comparables: posicionesNormales(filas).map(i => {
            const f = filas[i]
            return {
                price: f.price,
                currency: f.currency,
                title: f.title ?? undefined,
                location: f.location ?? undefined,
                features: f.features,
            }
        }),
        expenseRates: tasas,
    })
    if (!base) return null

    const resultado = completarValuacion(base, {
        ownerSharePercent: previo?.ownerSharePercent ?? 100,
        purchaseScenarios: (previo?.purchaseScenarios ?? []).map(entradaDeEscenario),
        selectedScenarioIds: previo?.selectedScenarioIds ?? [],
        previousPurchaseResult: previo?.purchaseResult,
    })
    return { sujeto, filas, resultado }
}
