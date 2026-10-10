import type { StockComposition } from './types'

/** Variación mensual del TOTAL de inmuebles en venta (decimal: -0.006 = -0,6 %).
 *
 *  La fuente del total (Infogram) no publica variación, así que se calcula contra
 *  nuestro historial (`market_snapshot_caba` del período anterior).
 *
 *  Devuelve null —y el PDF no muestra nada— cuando no hay con qué comparar o
 *  cuando el total es IDÉNTICO al anterior: eso no es "0 %", es que la fuente no
 *  se actualizó entre un mes y otro (pasó en 2026-09, que repitió el 110.907 de
 *  agosto). Mostrar "0 % mensual" ahí sería afirmar algo falso. */
export function variacionMensualTotal(actual: number | null, anterior: number | null): number | null {
    if (actual === null || anterior === null) return null
    if (actual <= 0 || anterior <= 0) return null
    if (actual === anterior) return null
    return actual / anterior - 1
}

export interface StockDestacado {
    valor: number | null
    rotulo: 'inmuebles en venta' | 'deptos en venta'
    /** Decimal o null (null = no mostrar variación). */
    variacion: number | null
}

/** Qué número destaca la página "Stock de inmuebles en venta en CABA".
 *
 *  Con total de inmuebles: el total, y SU variación (nunca la de departamentos,
 *  que es otra población). Sin total: cae al dato de departamentos con su rótulo
 *  correcto, para no mostrar nunca un número que diga ser otra cosa. */
export function stockDestacado(stock: StockComposition, totalAnterior: number | null): StockDestacado {
    if (stock.totalInmuebles !== null && stock.totalInmuebles > 0) {
        return {
            valor: stock.totalInmuebles,
            rotulo: 'inmuebles en venta',
            variacion: variacionMensualTotal(stock.totalInmuebles, totalAnterior),
        }
    }
    // Un 0 exacto en la variación de deptos tampoco se muestra, por la misma razón
    // que en el total: en estas fuentes significa "sin actualizar", no "estable".
    const vm = stock.stockVm
    return { valor: stock.stockDeptos, rotulo: 'deptos en venta', variacion: vm === null || vm === 0 ? null : vm }
}
