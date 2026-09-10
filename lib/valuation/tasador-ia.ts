/**
 * Tasador IA: la IA es el TASADOR (juzga calidad, estado, disposición, piso,
 * antigüedad y ubicación de cada propiedad); la CALCULADORA es la misma
 * (`calculateValuation`). Por eso el resultado tiene exactamente la forma del
 * clásico y ningún coeficiente del PDF queda sin explicar por la tabla del
 * método.
 *
 * Una sola llamada al modelo por request (regla dura de CLAUDE.md). El
 * proveedor se inyecta (`deps.chat`) para que el módulo sea puro y testeable.
 */
import { z } from 'zod'
import {
  calculateValuation,
  type ExpenseRates, type PurchaseResult, type PurchaseScenarioId, type PurchaseScenarioInput,
  type ValuationFeatures, type ValuationProperty,
} from './calculator'
import { VALUATION_RULES } from './rules'
import { completarValuacion } from './completar-valuacion'
import { huellaDeInsumos } from './huella-insumos'
import type { AiValuationResult, AiPropertyInterpretation } from './ia-tipos'

export interface EntradaTasadorIA {
  subject: ValuationProperty
  /** SOLO comparables normales, en orden de sort_order. */
  comparables: ValuationProperty[]
  expenseRates?: ExpenseRates
  ownerSharePercent: number
  purchaseScenarios: PurchaseScenarioInput[]
  selectedScenarioIds: PurchaseScenarioId[]
  previousPurchaseResult?: PurchaseResult
}

/** Forma mínima del cliente de chat que necesita el tasador (compatible con `chatCompletion`). */
export type ChatTasador = (input: {
  messages: { role: 'system' | 'user'; content: string }[]
  temperature: number
  jsonMode: true
  maxTokens: number
  timeoutMs: number
  model?: string
}) => Promise<{
  content: string
  provider: string
  model: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}>

export class ErrorTasadorIA extends Error {
  constructor(msg: string) {
    super(`Tasador IA: ${msg}`)
    this.name = 'ErrorTasadorIA'
  }
}

const CALIDADES = ['ECONOMIC', 'GOOD_ECONOMIC', 'GOOD', 'VERY_GOOD', 'EXCELLENT'] as const
const ESTADOS = ['STATE_1', 'STATE_1_5', 'STATE_2', 'STATE_2_5', 'STATE_3', 'STATE_3_5', 'STATE_4', 'STATE_4_5', 'STATE_5'] as const
const DISPOSICIONES = ['FRONT', 'BACK', 'LATERAL', 'INTERNAL'] as const
const MAX_DESCRIPCION = 600
const MAX_RAZON = 240
const MAX_RESUMEN = 600
/** Techo de tiempo de la llamada: la función de Netlify se corta bastante antes de 60 s. */
export const TIMEOUT_MS = 20_000

const interpretacionSchema = z.object({
  quality: z.enum(CALIDADES),
  conservationState: z.enum(ESTADOS),
  disposition: z.enum(DISPOSICIONES),
  floor: z.number().int().min(0).max(60).nullable().optional(),
  age: z.number().min(0).max(150).nullable().optional(),
  locationCoefficient: z.number().min(0.7).max(1.3),
  reasoning: z.string().max(4000).transform(s => s.trim().slice(0, MAX_RAZON)),
})
const respuestaSchema = z.object({
  subject: interpretacionSchema,
  comparables: z.array(interpretacionSchema.extend({ index: z.number().int().min(0) })),
  summary: z.string().max(8000).transform(s => s.trim().slice(0, MAX_RESUMEN)),
  confidence: z.enum(['alta', 'media', 'baja']),
})
export type InterpretacionIA = z.infer<typeof interpretacionSchema>
export type RespuestaTasadorIA = z.infer<typeof respuestaSchema>

/** El método, GENERADO desde `VALUATION_RULES` para que nunca se desincronice del código. */
export function describirMetodo(): string {
  const R = VALUATION_RULES
  const numeros = (o: Record<string, number>) =>
    Object.entries(o).map(([k, v]) => `  - ${k}: ${v}`).join('\n')
  const estados = Object.entries(R.CONSERVATION_STATE)
    .map(([k, v]) => `  - ${k}: ${v.name} (depreciación ${v.depreciation})`).join('\n')
  return [
    'MÉTODO DE COMPARABLES (Ross-Heidecke). Cada propiedad tiene un coeficiente total N = J × K_piso × K_disposición × M × W.',
    `Superficie homogeneizada = cubierta × ${R.SURFACE_COEFFICIENTS.COVERED} + semicubierta × ${R.SURFACE_COEFFICIENTS.SEMI_COVERED} + descubierta × ${R.SURFACE_COEFFICIENTS.UNCOVERED}.`,
    'J = coeficiente de ubicación (1.00 = zona de referencia; menor si la ubicación resta, mayor si suma; rango permitido 0.70 a 1.30).',
    'K_piso, por número de piso (0 = planta baja):\n' + numeros(R.FLOOR_COEFFICIENTS),
    'K_disposición:\n' + numeros(R.DISPOSITION_COEFFICIENTS),
    'M = calidad constructiva:\n' + numeros(R.QUALITY_COEFFICIENTS),
    `W = edad-estado (tabla Ross-Heidecke, vida útil ${R.DEFAULT_LIFE_SPAN} años) según antigüedad y estado de conservación:\n` + estados,
    'El precio por m² ajustado de cada comparable es precio / superficie homogeneizada / N. Se promedian y se multiplican por el N de la propiedad a tasar.',
  ].join('\n\n')
}

const sinHtml = (t: string | undefined) =>
  (t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPCION)

function fichaParaPrompt(p: ValuationProperty, index?: number) {
  const f = p.features
  return {
    ...(index !== undefined ? { index } : {}),
    titulo: p.title ?? '',
    ubicacion: p.location ?? '',
    precio: p.price ?? null,
    moneda: p.currency ?? null,
    superficie: {
      cubierta: f.coveredArea ?? null, semicubierta: f.semiCoveredArea ?? null,
      descubierta: f.uncoveredArea ?? null, total: f.totalArea ?? null,
    },
    piso: f.floor ?? null,
    pisosTotales: f.totalFloors ?? null,
    antiguedad: f.age ?? null,
    ambientes: f.rooms ?? null,
    dormitorios: f.bedrooms ?? null,
    banos: f.bathrooms ?? null,
    cocheras: f.garages ?? null,
    publicado: f.publishedDate ?? null,
    vistas: f.views ?? null,
    descripcion: sinHtml(p.description),
  }
}

export function armarPromptTasadorIA(e: EntradaTasadorIA): { system: string; user: string } {
  const system = [
    'Sos un tasador inmobiliario senior de Buenos Aires. Aplicás el método de comparables de la inmobiliaria, tal cual está descripto abajo, interpretando cada propiedad a partir de su descripción, ubicación, antigüedad y datos.',
    describirMetodo(),
    'TU TAREA: para la propiedad a tasar y para CADA comparable, decidir quality, conservationState, disposition, floor, age y locationCoefficient, con una justificación corta (máx. 240 caracteres) por propiedad. Si la descripción dice "a estrenar" o "reciclado", reflejalo en conservationState. Si un comparable está en otro barrio o en una zona peor/mejor que la propiedad a tasar, ajustá su locationCoefficient. No inventes datos: si algo no se puede saber, usá el valor más probable y decilo en la justificación.',
    'RESPONDÉ SOLO con un JSON con esta forma exacta:',
    '{"subject":{"quality":"GOOD","conservationState":"STATE_2","disposition":"FRONT","floor":3,"age":40,"locationCoefficient":1.0,"reasoning":"..."},"comparables":[{"index":0,"quality":"...","conservationState":"...","disposition":"...","floor":0,"age":0,"locationCoefficient":1.0,"reasoning":"..."}],"summary":"resumen de 2-4 frases sobre cómo interpretaste el conjunto","confidence":"alta|media|baja"}',
    `Valores permitidos: quality ∈ ${CALIDADES.join('|')}; conservationState ∈ ${ESTADOS.join('|')}; disposition ∈ ${DISPOSICIONES.join('|')}; locationCoefficient entre 0.70 y 1.30. Debe haber exactamente un objeto por comparable, con su index.`,
  ].join('\n\n')
  const user = JSON.stringify({
    propiedadATasar: fichaParaPrompt(e.subject),
    comparables: e.comparables.map((c, i) => fichaParaPrompt(c, i)),
  }, null, 1)
  return { system, user }
}

export function validarRespuestaTasadorIA(raw: unknown, cantidadComparables: number): RespuestaTasadorIA {
  const parsed = respuestaSchema.safeParse(raw)
  if (!parsed.success) {
    const primero = parsed.error.issues[0]
    const donde = primero?.path.length ? primero.path.join('.') : 'respuesta'
    throw new ErrorTasadorIA(`respuesta inválida del modelo (${donde}: ${primero?.message ?? 'forma inesperada'})`)
  }
  const indices = parsed.data.comparables.map(c => c.index).sort((a, b) => a - b)
  const esperados = Array.from({ length: cantidadComparables }, (_, i) => i)
  if (JSON.stringify(indices) !== JSON.stringify(esperados)) {
    throw new ErrorTasadorIA(`el modelo no interpretó todos los comparables (esperaba ${cantidadComparables}, recibió índices ${indices.join(',') || 'ninguno'})`)
  }
  return parsed.data
}

/** Lo objetivo (superficies, precio) se respeta; piso/antigüedad solo si faltaban; el juicio es de la IA. */
export function fusionarInterpretacion(base: ValuationFeatures, ia: InterpretacionIA): ValuationFeatures {
  const tiene = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
  return {
    ...base,
    quality: ia.quality,
    conservationState: ia.conservationState,
    disposition: ia.disposition,
    locationCoefficient: ia.locationCoefficient,
    floor: tiene(base.floor) ? base.floor : (ia.floor ?? undefined),
    age: tiene(base.age) ? base.age : (ia.age ?? undefined),
  }
}

export async function correrTasadorIA(
  e: EntradaTasadorIA,
  deps: { chat: ChatTasador; ahora?: () => Date },
): Promise<AiValuationResult> {
  if (e.comparables.length < 3) throw new ErrorTasadorIA('hacen falta al menos 3 comparables')
  // La calculadora SALTEA comparables sin precio o sin superficie, y entonces
  // `comparableAnalysis[i]` dejaría de corresponder con `ai.comparables[i]`.
  const invalido = e.comparables.findIndex(c =>
    !c.price || c.price <= 0 || !(c.features.coveredArea || c.features.semiCoveredArea || c.features.uncoveredArea))
  if (invalido >= 0) throw new ErrorTasadorIA(`el comparable ${invalido + 1} no tiene precio o superficie`)

  const { system, user } = armarPromptTasadorIA(e)
  const res = await deps.chat({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 2000,
    timeoutMs: TIMEOUT_MS,
    model: process.env.TASADOR_IA_MODEL || undefined,
  })
  let raw: unknown
  try {
    raw = JSON.parse(res.content)
  } catch {
    throw new ErrorTasadorIA('el modelo no devolvió JSON')
  }
  const r = validarRespuestaTasadorIA(raw, e.comparables.length)

  const subject: AiPropertyInterpretation = {
    features: fusionarInterpretacion(e.subject.features, r.subject),
    reasoning: r.subject.reasoning,
  }
  const porIndice = new Map(r.comparables.map(c => [c.index, c]))
  const comparables: AiPropertyInterpretation[] = e.comparables.map((c, i) => {
    const ia = porIndice.get(i)
    // Validado arriba: hay exactamente uno por índice. El guard es para el tipo.
    if (!ia) throw new ErrorTasadorIA(`falta la interpretación del comparable ${i + 1}`)
    return { features: fusionarInterpretacion(c.features, ia), reasoning: ia.reasoning }
  })

  const base = calculateValuation({
    subject: { ...e.subject, features: subject.features },
    comparables: e.comparables.map((c, i) => ({ ...c, features: comparables[i].features })),
    expenseRates: e.expenseRates,
  })
  if (!base) throw new ErrorTasadorIA('la calculadora no pudo valuar con la interpretación recibida')
  const completo = completarValuacion(base, {
    ownerSharePercent: e.ownerSharePercent,
    purchaseScenarios: e.purchaseScenarios,
    selectedScenarioIds: e.selectedScenarioIds,
    previousPurchaseResult: e.previousPurchaseResult,
  })
  return {
    ...completo,
    ai: {
      provider: res.provider,
      model: res.model,
      generatedAt: (deps.ahora ?? (() => new Date()))().toISOString(),
      confidence: r.confidence,
      summary: r.summary,
      inputFingerprint: huellaDeInsumos({
        subject: e.subject, comparables: e.comparables,
        expenseRates: e.expenseRates, ownerSharePercent: e.ownerSharePercent,
      }),
      subject,
      comparables,
      usage: res.usage,
    },
  }
}
