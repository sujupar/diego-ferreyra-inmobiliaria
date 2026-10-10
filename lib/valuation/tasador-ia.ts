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
import { VALUATION_RULES, ROSS_HEIDECKE_TABLE } from './rules'
import { planillaDelMetodo, verificarPlanilla } from './planilla-ia'
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
  provider?: 'openai' | 'deepseek'
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

/**
 * Modelo por defecto del Tasador IA: gpt-4.1 (OpenAI).
 *
 * POR QUÉ (medido el 2026-10-10 sobre 4 tasaciones reales, mismo prompt):
 * gpt-4o-mini no calculaba — copiaba los números del ejemplo del prompt y llegó
 * a dar un coeficiente total de 27,56 — con 18 a 19 cuentas corregidas por
 * tasación; gpt-4.1 erró de 0 a 9 (casi todo, leer la fila exacta de la tabla
 * Ross-Heidecke) y además fue el más rápido (5 a 7 s). Se fija el PROVEEDOR
 * porque el default de la cuenta puede ser DeepSeek, que no tiene este modelo.
 * `TASADOR_IA_MODEL` lo cambia sin tocar código.
 */
export const MODELO_TASADOR_IA = 'gpt-4.1'

/**
 * Rango del coeficiente de ubicación que puede decidir la IA. Era 0,70–1,30 y
 * por sí solo podía mover el precio más de 30 % respecto del clásico (spec D2,
 * 2026-10-03): ese margen explicaba casos como 130.000 vs 240.000.
 */
export const UBICACION_MIN = 0.85
export const UBICACION_MAX = 1.15

/** La planilla que el modelo calcula por propiedad (ver planilla-ia.ts). */
const planillaSchema = z.object({
  superficieHomologada: z.number().min(0),
  kPiso: z.number().min(0),
  kDisposicion: z.number().min(0),
  mCalidad: z.number().min(0),
  // Sin tope arriba: un % de vida > 99 (edificio muy viejo) es un error de cuenta
  // que verificarPlanilla corrige y registra; rechazarlo tiraba la tasación entera.
  porcentajeVida: z.number().min(0),
  kTabla: z.number().min(0),
  wEdadEstado: z.number().min(0),
  jUbicacion: z.number().min(0),
  nTotal: z.number().min(0),
})

const interpretacionSchema = z.object({
  quality: z.enum(CALIDADES),
  conservationState: z.enum(ESTADOS),
  disposition: z.enum(DISPOSICIONES),
  // Un piso negativo (sótano) no existe en la tabla del método: cuenta como dato
  // vacío, igual que en el clásico. Rechazarlo tiraba la tasación entera.
  floor: z.number().int().max(60).nullable().optional().transform(v => (typeof v === 'number' && v < 0 ? null : v)),
  age: z.number().min(0).max(150).nullable().optional(),
  locationCoefficient: z.number().min(UBICACION_MIN).max(UBICACION_MAX),
  planilla: planillaSchema,
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

/**
 * El método COMPLETO, GENERADO desde `VALUATION_RULES` y la tabla de la
 * calculadora para que nunca se desincronice del código.
 *
 * POR QUÉ COMPLETO (pedido del dueño, 2026-10-10): antes solo llevaba el % de
 * depreciación de un edificio NUEVO por estado ("Estado 3: 18,10 %"), sin la
 * tabla Ross-Heidecke por edad ni la regla W = 1 − K/200. Con eso el modelo no
 * podía calcular el coeficiente de edad-estado como el clásico. Ahora tiene
 * cada tabla y cada regla tal como las aplica `calculateValuation`.
 */
export function describirMetodo(): string {
  const R = VALUATION_RULES
  const F = R.FLOOR_COEFFICIENTS
  const numeros = (o: Record<string, number>) =>
    Object.entries(o).map(([k, v]) => `  - ${k}: ${v}`).join('\n')
  const estados = Object.keys(R.CONSERVATION_STATE)
  const tabla = Object.entries(ROSS_HEIDECKE_TABLE)
    .map(([pv, fila]) => `${pv}: ${fila.join(' ')}`).join('\n')
  return [
    'MÉTODO DE COMPARABLES (Ross-Heidecke). Para CADA propiedad (la tasada y cada comparable) se calcula esta planilla, en este orden:',
    `1. superficieHomologada = cubierta × ${R.SURFACE_COEFFICIENTS.COVERED} + semicubierta × ${R.SURFACE_COEFFICIENTS.SEMI_COVERED} + descubierta × ${R.SURFACE_COEFFICIENTS.UNCOVERED} (m²). Un dato vacío cuenta 0.`,
    `2. kPiso, por número de piso (0 = planta baja). Si el piso está vacío, el método lo toma como planta baja. 0 → ${F.GROUND_FLOOR}; 1 → ${F.FLOOR_1}; 2 → ${F.FLOOR_2}; 3 y 4 → ${F.FLOOR_3_4}; 5 y 6 → ${F.FLOOR_5_6}; 7 y 8 → ${F.FLOOR_7_8}; 9 o más → ${F.FLOOR_HIGH}.`,
    '3. kDisposicion (vacío = FRONT):\n' + numeros(R.DISPOSITION_COEFFICIENTS),
    '4. mCalidad (vacío = GOOD_ECONOMIC):\n' + numeros(R.QUALITY_COEFFICIENTS),
    `5. porcentajeVida = MIN(99, REDONDEAR(100 × antigüedad / ${R.DEFAULT_LIFE_SPAN})). Vida útil fija de ${R.DEFAULT_LIFE_SPAN} años; antigüedad vacía = 0.`,
    `6. kTabla = valor de la tabla Ross-Heidecke en la fila porcentajeVida y la columna del estado de conservación (vacío = STATE_2). Columnas, en orden: ${estados.join(' ')}.\nTABLA ROSS-HEIDECKE (fila: valores por columna):\n${tabla}`,
    '7. wEdadEstado: W = 1 − K / 200 (la mitad de la depreciación de la tabla), entre 0 y 1.',
    `8. jUbicacion = coeficiente de ubicación (1.00 = equivalente a la propiedad tasada; rango ${UBICACION_MIN} a ${UBICACION_MAX}).`,
    '9. nTotal = jUbicacion × kPiso × kDisposicion × mCalidad × wEdadEstado.',
    'Precio por m² ajustado de cada comparable = precio / superficieHomologada / nTotal. Se promedian y se multiplican por el nTotal de la propiedad tasada; por su superficieHomologada da el valor.',
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
    // Lo que cargó el asesor va marcado como FIJO: el modelo lo repite tal
    // cual y solo decide lo que queda vacío. `fusionarInterpretacion` lo
    // garantiza igual aunque el modelo desobedezca.
    fijadoPorElAsesor: camposFijados(f),
    aDecidir: (['quality', 'conservationState', 'disposition', 'floor', 'age', 'locationCoefficient'] as const)
      .filter(k => !(k in camposFijados(f))),
  }
}

export function armarPromptTasadorIA(e: EntradaTasadorIA): { system: string; user: string } {
  const system = [
    'Sos un tasador inmobiliario senior de Buenos Aires. Aplicás el método de comparables de la inmobiliaria, tal cual está descripto abajo, interpretando cada propiedad a partir de su descripción, ubicación, antigüedad y datos.',
    describirMetodo(),
    'REGLA DE ORO: los valores que el asesor ya cargó vienen en "fijadoPorElAsesor" y son DEFINITIVOS. Repetilos exactamente iguales en tu respuesta; no los cambies bajo ningún concepto. Si tu lectura no coincide con alguno, decilo en la justificación (ej. "el asesor fijó Buena; por la descripción parece Muy Buena"), pero el valor queda el que fijó el asesor.',
    'TU TAREA: para la propiedad a tasar y para CADA comparable, (a) decidir SOLO los campos listados en "aDecidir", tomando en cuenta el conjunto de comparables, y (b) calcular la PLANILLA COMPLETA del método (pasos 1 a 9) con los valores definitivos: los fijados por el asesor más los que decidiste. Cada número de la planilla sale de las tablas de arriba, no de una estimación. Agregá una justificación corta (máx. 240 caracteres) por propiedad.',
    'locationCoefficient es SOLO ubicación (barrio, zona, calle, cercanía a avenidas/transporte/verde): 1.00 si es equivalente a la de la propiedad a tasar; menor si es peor o más lejana; mayor si es mejor. NUNCA lo muevas por estado de conservación, antigüedad, calidad, piso o superficie: eso ya está contado en los otros coeficientes y sería contarlo dos veces. La propiedad a tasar lleva locationCoefficient 1.00 salvo que su ubicación sea claramente distinta del promedio de los comparables.',
    'floor y age: completalos ÚNICAMENTE si la descripción o el título lo dicen de forma explícita (ej. "4to piso", "a estrenar", "50 años"). Si no está dicho, devolvé null: no adivines, la calculadora usa el mismo criterio que el tasador clásico.',
    'Cada <n> es un número que CALCULÁS para esa propiedad con las tablas de arriba (buscá la fila y la columna de la tabla Ross-Heidecke); no hay valores de ejemplo para copiar.',
    'RESPONDÉ SOLO con un JSON con esta forma exacta:',
    '{"subject":{"quality":"GOOD","conservationState":"STATE_2","disposition":"FRONT","floor":3,"age":40,"locationCoefficient":1.0,"planilla":{"superficieHomologada":<n>,"kPiso":<n>,"kDisposicion":<n>,"mCalidad":<n>,"porcentajeVida":<n>,"kTabla":<n>,"wEdadEstado":<n>,"jUbicacion":<n>,"nTotal":<n>},"reasoning":"..."},"comparables":[{"index":0,"quality":"...","conservationState":"...","disposition":"...","floor":0,"age":0,"locationCoefficient":1.0,"planilla":{...},"reasoning":"..."}],"summary":"resumen de 2-4 frases sobre cómo interpretaste el conjunto","confidence":"alta|media|baja"}',
    `Valores permitidos: quality ∈ ${CALIDADES.join('|')}; conservationState ∈ ${ESTADOS.join('|')}; disposition ∈ ${DISPOSICIONES.join('|')}; locationCoefficient entre ${UBICACION_MIN} y ${UBICACION_MAX}. Debe haber exactamente un objeto por comparable, con su index.`,
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

const tieneNumero = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
const tieneTexto = (v: string | null | undefined): v is string => typeof v === 'string' && v.length > 0

/**
 * Regla del dueño (2026-09-12): lo que cargó el asesor MANDA, al 100%, para la
 * propiedad tasada y para cada comparable. La IA solo completa lo que quedó
 * vacío (típicamente el coeficiente de ubicación, que casi nunca se carga, y
 * piso/antigüedad cuando faltan) y da su lectura en la justificación. Si no
 * coincide con un valor fijado, lo dice, pero no lo cambia.
 */
/** Los juicios que la IA puede completar; la planilla y la justificación no intervienen en la fusión. */
type JuiciosIA = Pick<InterpretacionIA, 'quality' | 'conservationState' | 'disposition' | 'floor' | 'age' | 'locationCoefficient'>

export function fusionarInterpretacion(base: ValuationFeatures, ia: JuiciosIA): ValuationFeatures {
  return {
    ...base,
    quality: tieneTexto(base.quality) ? base.quality : ia.quality,
    conservationState: tieneTexto(base.conservationState) ? base.conservationState : ia.conservationState,
    disposition: tieneTexto(base.disposition) ? base.disposition : ia.disposition,
    locationCoefficient: tieneNumero(base.locationCoefficient) ? base.locationCoefficient : ia.locationCoefficient,
    floor: tieneNumero(base.floor) ? base.floor : (ia.floor ?? undefined),
    age: tieneNumero(base.age) ? base.age : (ia.age ?? undefined),
  }
}

/** Qué campos de juicio ya fijó el asesor en esta propiedad (la IA no los toca). */
export function camposFijados(f: ValuationFeatures): Record<string, string | number> {
  const fijos: Record<string, string | number> = {}
  if (tieneTexto(f.quality)) fijos.quality = f.quality
  if (tieneTexto(f.conservationState)) fijos.conservationState = f.conservationState
  if (tieneTexto(f.disposition)) fijos.disposition = f.disposition
  if (tieneNumero(f.locationCoefficient)) fijos.locationCoefficient = f.locationCoefficient
  if (tieneNumero(f.floor)) fijos.floor = f.floor
  if (tieneNumero(f.age)) fijos.age = f.age
  return fijos
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
    // La planilla completa por propiedad suma ~60 tokens de salida a cada una.
    maxTokens: 3500,
    timeoutMs: TIMEOUT_MS,
    model: process.env.TASADOR_IA_MODEL || MODELO_TASADOR_IA,
    provider: 'openai',
  })
  let raw: unknown
  try {
    raw = JSON.parse(res.content)
  } catch {
    throw new ErrorTasadorIA('el modelo no devolvió JSON')
  }
  const r = validarRespuestaTasadorIA(raw, e.comparables.length)

  // La planilla guardada es la del MÉTODO para las features definitivas (es la
  // que usa la calculadora); lo que el modelo calculó distinto queda como corrección.
  const interpretar = (base: ValuationFeatures, ia: InterpretacionIA): AiPropertyInterpretation => {
    const features = fusionarInterpretacion(base, ia)
    return {
      features,
      reasoning: ia.reasoning,
      planilla: planillaDelMetodo(features),
      correcciones: verificarPlanilla(features, ia.planilla),
    }
  }
  const subject = interpretar(e.subject.features, r.subject)
  const porIndice = new Map(r.comparables.map(c => [c.index, c]))
  const comparables: AiPropertyInterpretation[] = e.comparables.map((c, i) => {
    const ia = porIndice.get(i)
    // Validado arriba: hay exactamente uno por índice. El guard es para el tipo.
    if (!ia) throw new ErrorTasadorIA(`falta la interpretación del comparable ${i + 1}`)
    return interpretar(c.features, ia)
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
