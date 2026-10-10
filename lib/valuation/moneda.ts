/**
 * Moneda de los comparables. Auditoría del 2026-10-03 (B6): el cálculo
 * promedia $/m² sin mirar la moneda, así que un aviso en pesos entraba al
 * promedio como si fueran dólares (un depto de ARS 150.000.000 "valía" USD
 * 150.000.000). Además el editor rotulaba "Precio (USD)" fijo.
 *
 * Regla: un comparable con moneda conocida distinta de USD no entra al cálculo
 * hasta que el asesor cargue su precio en USD o lo descarte. Sin moneda (filas
 * viejas, hoy 1 sola en la base) se toma como USD para no bloquear lo cargado.
 */
export function requiereConversion(moneda: string | null | undefined): boolean {
    const m = (moneda ?? '').trim().toUpperCase()
    return m !== '' && m !== 'USD'
}

export function comparablesEnOtraMoneda(comparables: Array<{ currency?: string | null }>): number[] {
    return comparables.flatMap((c, i) => (requiereConversion(c.currency) ? [i] : []))
}
