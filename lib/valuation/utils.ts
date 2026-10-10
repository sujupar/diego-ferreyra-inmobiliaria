/**
 * Formatea un valor numérico como moneda. Usa locale es-AR por consistencia visual.
 * Maneja USD/ARS/null y retorna string sin decimales.
 *
 * Formato USD: "USD 214.000" (con espacio, en mayúsculas para máxima claridad).
 * Formato ARS: "$214.000".
 */
export function formatCurrency(value: number, currency?: string | null): string {
    const safe = Number.isFinite(value) ? value : 0
    const cur = currency || 'USD'
    if (cur === 'USD') return `USD ${Math.round(safe).toLocaleString('es-AR')}`
    if (cur === 'ARS') return `$${Math.round(safe).toLocaleString('es-AR')}`
    return `${cur} ${Math.round(safe).toLocaleString('es-AR')}`
}

/**
 * Nombre de archivo limpio y reenviable para el PDF de tasación.
 * - Quita acentos (NFD + strip de diacríticos combinantes U+0300–U+036F) en vez
 *   de convertirlos en "_" (antes "Pérez" quedaba "P_rez").
 * - Conserva espacios (el usuario los prefiere; los navegadores los soportan)
 *   y colapsa separadores repetidos.
 * Ej: "Roque Pérez 3059" → "Informe Tasacion Roque Perez 3059.pdf".
 */
export function buildAppraisalFilename(propertyName: string | null | undefined): string {
    const base = (propertyName || 'Propiedad')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')   // diacríticos combinantes
        .replace(/[^a-zA-Z0-9 -]/g, ' ')   // solo alfanumérico, espacio y guion
        .replace(/\s+/g, ' ')              // colapsar espacios
        .trim() || 'Propiedad'
    return `Informe Tasacion ${base}.pdf`
}

/**
 * Número entero con formato argentino ("214.000"). El PDF usaba
 * `toLocaleString()` sin locale: según el navegador salía "214,000"
 * (auditoría 2026-10-03, C4).
 */
export function formatNumero(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
    return Math.round(value).toLocaleString('es-AR')
}

/** "125k" para la columna Valor del Mapa de Valor; sin precio, "—" (antes "0k"). */
export function formatMiles(precio: number | null | undefined): string {
    if (typeof precio !== 'number' || !Number.isFinite(precio) || precio <= 0) return '—'
    return `${formatNumero(precio / 1000)}k`
}
