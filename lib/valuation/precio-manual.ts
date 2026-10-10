/**
 * Precio cargado a mano en el editor del informe (`reportEdits.priceOverrides`).
 *
 * Auditoría del 2026-10-03 (B5): el precio de publicación a mano era solo
 * VISUAL. El PDF mostraba "Publicación USD 200.000" pero la venta, la
 * escritura, los gastos, el dinero en mano y los escenarios de compra seguían
 * saliendo del precio calculado: el mismo informe decía dos cosas distintas.
 *
 * Esta función devuelve el resultado con toda la cadena de precios recalculada
 * desde el precio a mano, con las tasas guardadas de la tasación y la MISMA
 * aritmética que el cálculo (`gastosDeVenta`). El análisis de comparables no se
 * toca. Es idempotente: aplicarla dos veces da lo mismo.
 */
import { gastosDeVenta, tasasDeVenta, valorDeVenta, zonaDeNoVenta, type ValuationResult } from './calculator'
import { completarValuacion } from './completar-valuacion'
import { entradaDeEscenario } from './purchase-scenarios'
import { formatCurrency } from './utils'

export interface PreciosManuales {
    publicationPrice?: number
    saleValue?: number
    noSaleZonePrice?: number
}

const valido = (v: number | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0

export function valuacionConPreciosManuales(
    resultado: ValuationResult,
    precios: PreciosManuales | undefined,
): ValuationResult {
    const publicacionManual = valido(precios?.publicationPrice) ? precios.publicationPrice : undefined
    const ventaManual = valido(precios?.saleValue) ? precios.saleValue : undefined
    if (publicacionManual === undefined && ventaManual === undefined) return resultado

    const tasas = tasasDeVenta(resultado.expenseRates)
    const publicationPrice = publicacionManual ?? resultado.publicationPrice
    const saleValue = ventaManual ?? valorDeVenta(publicationPrice, tasas)
    const base: ValuationResult = {
        ...resultado,
        publicationPrice,
        noSaleZonePrice: publicacionManual !== undefined ? zonaDeNoVenta(publicationPrice) : resultado.noSaleZonePrice,
        saleValue,
        ...gastosDeVenta(saleValue, tasas),
        expenseRates: tasas,
    }
    // Parte del propietario y escenarios de compra: la misma función que el
    // asistente, sobre el dinero en mano nuevo.
    return completarValuacion(base, {
        ownerSharePercent: resultado.ownerSharePercent ?? 100,
        purchaseScenarios: (resultado.purchaseScenarios ?? []).map(entradaDeEscenario),
        selectedScenarioIds: resultado.selectedScenarioIds ?? [],
        previousPurchaseResult: resultado.purchaseResult,
    })
}

/**
 * La Zona de No Venta es el precio por debajo del cual NO conviene vender:
 * nunca puede quedar por debajo de la publicación. `undefined` = se usa la
 * calculada (no es error). Devuelve el mensaje para mostrar, o null si vale.
 */
export function validarZonaDeNoVenta(
    zonaNoVenta: number | undefined,
    publicacion: number,
    moneda: string = 'USD',
): string | null {
    if (zonaNoVenta === undefined) return null
    if (!valido(zonaNoVenta)) return 'Ingresá un precio válido para la Zona de No Venta.'
    if (zonaNoVenta < publicacion) {
        return `La Zona de No Venta no puede ser menor que el precio de publicación (${formatCurrency(publicacion, moneda)}).`
    }
    return null
}
