/**
 * Qué tasador está EN USO y cómo se lee su resultado. Todas las pantallas
 * (detalle, wizard, PDF) pasan por acá para no repartir el `if` por el código.
 */
import type { ValuationFeatures, ValuationProperty, ValuationResult } from './calculator'
import type { AiValuationMeta, ColumnasTasadorIA, ValuationSource } from './ia-tipos'

export interface FilaConTasadores extends ColumnasTasadorIA {
  valuation_result: ValuationResult
  updated_at?: string | null
}

/** Forma mínima de una fila de `appraisal_comparables` que necesita este módulo. */
export interface FilaComparable {
  title: string | null
  location: string | null
  url: string | null
  price: number | null
  currency: string | null
  description: string | null
  images: string[] | null
  features: ValuationFeatures
  analysis: { propertyType?: string } | null
  sort_order: number
}

/** Un `pending` más viejo que esto es una función que murió a mitad: se trata como fallido. */
export const PENDIENTE_MAX_MS = 2 * 60_000

export function comparablesNormales(rows: FilaComparable[]): FilaComparable[] {
  return rows
    .filter(r => r.analysis?.propertyType !== 'overpriced' && r.analysis?.propertyType !== 'purchase')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function filaAPropiedad(row: FilaComparable, features?: ValuationFeatures): ValuationProperty {
  return {
    title: row.title ?? '',
    location: row.location ?? '',
    description: row.description ?? '',
    url: row.url ?? '',
    price: row.price,
    currency: row.currency,
    images: row.images ?? [],
    features: features ?? row.features ?? {},
  }
}

const PROPIEDAD_VACIA: ValuationProperty = {
  title: '', location: '', description: '', url: '', price: null, currency: null, images: [], features: {},
}

/** `comparableAnalysis[i].property` se quita al guardar; acá vuelve desde las filas. */
export function rehidratar(result: ValuationResult, comparables: ValuationProperty[]): ValuationResult {
  if (!result?.comparableAnalysis?.length) return result
  return {
    ...result,
    comparableAnalysis: result.comparableAnalysis.map((a, i) => ({
      ...a,
      property: a.property ?? comparables[i] ?? PROPIEDAD_VACIA,
    })),
  }
}

/** Los comparables tal como los vio la IA: la fila aporta título/precio, el snapshot las features. */
export function comparablesDelSnapshotIA(rows: FilaComparable[], ai: AiValuationMeta): ValuationProperty[] {
  return comparablesNormales(rows).map((r, i) => filaAPropiedad(r, ai.comparables[i]?.features ?? r.features))
}

export function valuacionActiva(
  fila: FilaConTasadores,
  rows: FilaComparable[],
): { source: ValuationSource; result: ValuationResult; comparables: ValuationProperty[] } {
  const snapshot = fila.ai_valuation_result
  if (fila.valuation_source === 'ai' && fila.ai_valuation_status === 'ready' && snapshot) {
    const comparables = comparablesDelSnapshotIA(rows, snapshot.ai)
    return { source: 'ai', result: rehidratar(snapshot, comparables), comparables }
  }
  // Defensa: si la IA está elegida pero no está lista, se lee la clásica.
  const comparables = comparablesNormales(rows).map(r => filaAPropiedad(r))
  return { source: 'calculator', result: rehidratar(fila.valuation_result, comparables), comparables }
}

export function preciosDesnormalizados(r: ValuationResult) {
  return {
    publication_price: r.publicationPrice,
    sale_value: r.saleValue,
    money_in_hand: r.moneyInHand,
    currency: r.currency,
  }
}

export type EstadoTarjetaIA = 'sin_generar' | 'analizando' | 'lista' | 'desactualizada' | 'fallida'

export function estadoTarjetaIA(fila: FilaConTasadores, huellaActual: string, ahora: Date = new Date()): EstadoTarjetaIA {
  const s = fila.ai_valuation_status
  if (!s) return 'sin_generar'
  if (s === 'failed') return 'fallida'
  if (s === 'pending') {
    const desde = fila.updated_at ? new Date(fila.updated_at).getTime() : 0
    return ahora.getTime() - desde > PENDIENTE_MAX_MS ? 'fallida' : 'analizando'
  }
  if (!fila.ai_valuation_result) return 'fallida'
  return fila.ai_valuation_result.ai.inputFingerprint === huellaActual ? 'lista' : 'desactualizada'
}
