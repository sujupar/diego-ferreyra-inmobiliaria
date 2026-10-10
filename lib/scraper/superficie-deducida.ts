/**
 * Superficie descubierta deducida de un aviso. Muchos portales informan solo
 * superficie total y cubierta; los extractores (y el editor) deducían
 * descubierta = total − cubierta sin avisar. Esa resta mezcla lo que el portal
 * llama "total" (a veces incluye semicubierta, cocheras o el lote) y entra al
 * 50 % en la superficie homologada. Auditoría del 2026-10-03 (B9): se sigue
 * deduciendo, pero queda MARCADA (`uncoveredAreaDeducida`) para que el editor
 * del comparable diga "deducida: revisar" hasta que el asesor la confirme.
 */
export interface SuperficiesDeAviso {
    coveredArea?: number | null
    totalArea?: number | null
    uncoveredArea?: number | null
    uncoveredAreaDeducida?: boolean
}

export function completarDescubiertaDeducida<T extends SuperficiesDeAviso>(f: T): T {
    if (f.uncoveredArea != null || f.totalArea == null || f.coveredArea == null) return f
    const diferencia = f.totalArea - f.coveredArea
    return { ...f, uncoveredArea: diferencia > 0 ? diferencia : 0, uncoveredAreaDeducida: true }
}

/** El asesor cargó (o confirmó) la descubierta: deja de ser deducida. */
export function confirmarDescubierta<T extends SuperficiesDeAviso>(f: T, valor?: number | null): T {
    // `undefined` (no `false`): al guardarse como JSON la marca desaparece.
    return { ...f, uncoveredArea: valor === undefined ? f.uncoveredArea : valor, uncoveredAreaDeducida: undefined }
}
