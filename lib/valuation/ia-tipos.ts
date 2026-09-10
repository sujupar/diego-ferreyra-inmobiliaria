/**
 * Tipos del Tasador IA.
 *
 * El resultado IA tiene EXACTAMENTE la forma de `ValuationResult` a propósito:
 * tablas, Mapa de Valor, gastos, escenarios y PDF no distinguen de dónde salió.
 * Lo único que se agrega es `ai`, la memoria de cómo lo interpretó el modelo
 * (features por propiedad + justificación), que es lo que permite volver a
 * calcular ese snapshot sin tocar el clásico.
 */
import type { ValuationFeatures, ValuationResult } from './calculator'

/** Qué tasador está EN USO en una tasación. */
export type ValuationSource = 'calculator' | 'ai'

export type AiValuationStatus = 'pending' | 'ready' | 'failed'

export type AiConfidence = 'alta' | 'media' | 'baja'

export interface AiPropertyInterpretation {
  /**
   * Snapshot COMPLETO de features con las que la IA tasó (objetivas +
   * subjetivas). Es la fuente para recalcular y para la edición en línea del
   * snapshot IA; las filas de `appraisal_comparables` siguen siendo del clásico.
   */
  features: ValuationFeatures
  /** Justificación corta (≤ 240 chars) de calidad/estado/disposición/ubicación. */
  reasoning: string
}

export interface AiValuationMeta {
  provider: string
  model: string
  /** ISO. */
  generatedAt: string
  confidence: AiConfidence
  /** ≤ 600 chars, para la tarjeta. */
  summary: string
  /** Huella de los insumos objetivos con los que se generó (ver `huella-insumos.ts`). */
  inputFingerprint: string
  subject: AiPropertyInterpretation
  /** Mismo orden que las filas normales (sort_order 0..n). */
  comparables: AiPropertyInterpretation[]
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export type AiValuationResult = ValuationResult & { ai: AiValuationMeta }

/** Las 4 columnas nuevas de `appraisals`, tal como viajan a las pantallas. */
export interface ColumnasTasadorIA {
  ai_valuation_result: AiValuationResult | null
  ai_valuation_status: AiValuationStatus | null
  ai_valuation_error: string | null
  valuation_source: ValuationSource
}
