import { PDFDocument } from 'pdf-lib'

/**
 * Post-procesa el PDF de tasación a nivel de PÁGINA (sin tocar la lógica de tasación
 * ni la estructura de PDFReport): construye un PDF nuevo con SOLO las páginas en
 * `visibleOrder` (índices 0-based del PDF original) y en ese orden. Borrar una página
 * = no incluir su índice; reordenar = el orden del array.
 *
 * Defensivo: ignora índices inválidos y, si `visibleOrder` queda vacío, devuelve el
 * PDF original intacto (nunca produce un PDF de 0 páginas).
 */
export async function buildPdfWithLayout(
    srcBytes: ArrayBuffer | Uint8Array,
    visibleOrder: number[],
): Promise<Uint8Array> {
    const src = await PDFDocument.load(srcBytes)
    const total = src.getPageCount()
    const valid = visibleOrder.filter(i => Number.isInteger(i) && i >= 0 && i < total)
    if (valid.length === 0) return await src.save()
    const out = await PDFDocument.create()
    const copied = await out.copyPages(src, valid)
    copied.forEach(p => out.addPage(p))
    return await out.save()
}

/** Cantidad de páginas del PDF (para la guarda de `pageCount`). */
export async function getPdfPageCount(bytes: ArrayBuffer | Uint8Array): Promise<number> {
    const doc = await PDFDocument.load(bytes)
    return doc.getPageCount()
}

export interface PdfLayout {
    order: number[]
    hidden: number[]
    pageCount: number
}

/** True si el layout efectivamente reordena u oculta algo (vs. el orden identidad). */
export function layoutChangesAnything(order: number[], hidden: number[]): boolean {
    return hidden.length > 0 || order.some((v, i) => v !== i)
}

/**
 * Resuelve un layout GUARDADO contra el PDF renderizado actual. Devuelve el orden de
 * páginas VISIBLES (índices 0-based) SOLO si la cantidad de páginas coincide con la
 * guardada (misma estructura). Si difiere (cambió el contenido), devuelve null y el
 * caller usa el orden por defecto — así un layout viejo nunca mapea páginas equivocadas.
 */
export function resolveSavedLayout(
    layout: PdfLayout | undefined | null,
    currentPageCount: number,
): number[] | null {
    if (!layout || layout.pageCount !== currentPageCount) return null
    const hidden = new Set(layout.hidden)
    const order = layout.order.filter(i => Number.isInteger(i) && i >= 0 && i < currentPageCount)
    // Completar con cualquier índice faltante en orden natural (robustez ante datos parciales).
    const seen = new Set(order)
    for (let i = 0; i < currentPageCount; i++) if (!seen.has(i)) order.push(i)
    return order.filter(i => !hidden.has(i))
}
