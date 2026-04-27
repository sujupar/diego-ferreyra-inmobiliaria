/**
 * Formatea un valor numérico como moneda. Usa locale es-AR por consistencia visual.
 * Maneja USD/ARS/null y retorna string sin decimales.
 */
export function formatCurrency(value: number, currency?: string | null): string {
    const safe = Number.isFinite(value) ? value : 0
    const cur = currency || 'USD'
    if (cur === 'USD') return `u$d${Math.round(safe).toLocaleString('es-AR')}`
    if (cur === 'ARS') return `$${Math.round(safe).toLocaleString('es-AR')}`
    return `${cur}${Math.round(safe).toLocaleString('es-AR')}`
}
