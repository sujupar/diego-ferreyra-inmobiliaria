import { describe, it, expect } from 'vitest'
import {
  armarPromptTasadorIA, validarRespuestaTasadorIA, fusionarInterpretacion, correrTasadorIA, describirMetodo,
  type EntradaTasadorIA, type ChatTasador,
} from './tasador-ia'
import { calculateValuation, type ValuationProperty } from './calculator'
import { huellaDeInsumos } from './huella-insumos'

const subject: ValuationProperty = {
  price: null, currency: 'USD', title: 'Depto 3 amb', location: 'Almagro, CABA',
  description: '<p>Luminoso, a estrenar, al frente</p>',
  features: { coveredArea: 60, uncoveredArea: 8, floor: 4, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'BACK' },
}
const comparables: ValuationProperty[] = [
  { price: 120_000, currency: 'USD', title: 'A', location: 'Almagro', description: 'Muy buen estado', features: { coveredArea: 55, floor: 2, age: 30, quality: 'GOOD_ECONOMIC', conservationState: 'STATE_2', disposition: 'FRONT' } },
  { price: 150_000, currency: 'USD', title: 'B', location: 'Almagro', description: 'Reciclado', features: { coveredArea: 65, floor: 6, age: 50, quality: 'GOOD', conservationState: 'STATE_3', disposition: 'BACK' } },
  { price: 99_000, currency: 'USD', title: 'C', location: 'Boedo', description: 'A refaccionar', features: { coveredArea: 50, floor: 1, age: 60 } },
]
const entrada: EntradaTasadorIA = {
  subject, comparables, expenseRates: { saleDiscountPercent: 5 },
  ownerSharePercent: 100, purchaseScenarios: [], selectedScenarioIds: [],
}

const interp = (i: number, extra: Record<string, unknown> = {}) => ({
  index: i, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'FRONT', floor: 3, age: 20,
  locationCoefficient: 1.0, reasoning: `c${i}`, ...extra,
})
const respuestaOk = () => ({
  subject: { quality: 'VERY_GOOD', conservationState: 'STATE_1', disposition: 'FRONT', floor: 4, age: 0, locationCoefficient: 1.05, reasoning: 'a estrenar' },
  comparables: [interp(0), interp(1, { conservationState: 'STATE_3', quality: 'GOOD' }), interp(2, { locationCoefficient: 0.95, quality: 'ECONOMIC' })],
  summary: 'Zona homogénea', confidence: 'media',
})

describe('describirMetodo — el prompt lleva las tablas del método, generadas del código', () => {
  it('incluye calidad, disposición, piso, estados y la vida útil', () => {
    const t = describirMetodo()
    expect(t).toContain('EXCELLENT')
    expect(t).toContain('1.275')
    expect(t).toContain('INTERNAL')
    expect(t).toContain('STATE_4_5')
    expect(t).toContain('70')
  })
})

describe('armarPromptTasadorIA', () => {
  it('lleva los comparables numerados con precio y superficies, y la descripción sin HTML', () => {
    const { system, user } = armarPromptTasadorIA(entrada)
    expect(system).toContain(describirMetodo())
    expect(user).toMatch(/"index":\s*0/)
    expect(user).toContain('120000')
    expect(user).toContain('Luminoso, a estrenar, al frente')
    expect(user).not.toContain('<p>')
  })
  it('marca lo que fijó el asesor y lo que queda a decidir', () => {
    const { system, user } = armarPromptTasadorIA(entrada)
    expect(system).toContain('REGLA DE ORO')
    const ficha = JSON.parse(user) as { propiedadATasar: { fijadoPorElAsesor: Record<string, unknown>; aDecidir: string[] }; comparables: Array<{ fijadoPorElAsesor: Record<string, unknown>; aDecidir: string[] }> }
    expect(ficha.propiedadATasar.fijadoPorElAsesor).toMatchObject({ quality: 'GOOD', conservationState: 'STATE_2', disposition: 'BACK', floor: 4 })
    expect(ficha.propiedadATasar.aDecidir).toEqual(['age', 'locationCoefficient'])
    expect(ficha.comparables[2].aDecidir).toEqual(['quality', 'conservationState', 'disposition', 'locationCoefficient'])
  })
  it('recorta descripciones largas a 600 caracteres', () => {
    const larga = { ...entrada, subject: { ...subject, description: 'x'.repeat(2000) } }
    const { user } = armarPromptTasadorIA(larga)
    expect(user).not.toContain('x'.repeat(601))
  })
})

describe('validarRespuestaTasadorIA — nunca datos a medias', () => {
  it('acepta una respuesta completa', () => {
    expect(validarRespuestaTasadorIA(respuestaOk(), 3).comparables).toHaveLength(3)
  })
  it('rechaza un enum inventado', () => {
    const r = respuestaOk(); r.comparables[0].quality = 'LUJO'
    expect(() => validarRespuestaTasadorIA(r, 3)).toThrow(/quality/i)
  })
  it('rechaza coeficiente de ubicación fuera de [0.70, 1.30]', () => {
    const r = respuestaOk(); r.subject.locationCoefficient = 1.6
    expect(() => validarRespuestaTasadorIA(r, 3)).toThrow(/locationCoefficient/i)
  })
  it('rechaza índices faltantes o repetidos', () => {
    const falta = respuestaOk(); falta.comparables.pop()
    expect(() => validarRespuestaTasadorIA(falta, 3)).toThrow(/comparable/i)
    const repite = respuestaOk(); repite.comparables[2].index = 1
    expect(() => validarRespuestaTasadorIA(repite, 3)).toThrow(/comparable/i)
  })
  it('rechaza lo que no es JSON de objeto', () => {
    expect(() => validarRespuestaTasadorIA('hola', 3)).toThrow()
    expect(() => validarRespuestaTasadorIA(null, 3)).toThrow()
  })
  it('recorta la justificación a 240 caracteres', () => {
    const r = respuestaOk(); r.subject.reasoning = 'y'.repeat(1000)
    expect(validarRespuestaTasadorIA(r, 3).subject.reasoning).toHaveLength(240)
  })
})

describe('fusionarInterpretacion — lo que cargó el asesor manda al 100%', () => {
  const base = { coveredArea: 55, uncoveredArea: 5, floor: 2, age: 30, quality: 'GOOD_ECONOMIC' as const, conservationState: 'STATE_3' as const, disposition: 'BACK' as const, locationCoefficient: 0.9 }
  const ia = { quality: 'EXCELLENT' as const, conservationState: 'STATE_1' as const, disposition: 'INTERNAL' as const, floor: 9, age: 5, locationCoefficient: 1.1, reasoning: 'r' }
  it('mantiene superficies, piso y antigüedad cuando ya estaban', () => {
    const f = fusionarInterpretacion(base, ia)
    expect(f.coveredArea).toBe(55); expect(f.uncoveredArea).toBe(5)
    expect(f.floor).toBe(2); expect(f.age).toBe(30)
  })
  it('NO cambia calidad, estado, disposición ni ubicación si el asesor los fijó', () => {
    const f = fusionarInterpretacion(base, ia)
    expect(f.quality).toBe('GOOD_ECONOMIC'); expect(f.conservationState).toBe('STATE_3')
    expect(f.disposition).toBe('BACK'); expect(f.locationCoefficient).toBe(0.9)
  })
  it('completa SOLO lo que quedó vacío (ubicación sin cargar, piso y antigüedad faltantes, calidad vacía)', () => {
    const f = fusionarInterpretacion({ coveredArea: 55, conservationState: 'STATE_2', disposition: 'FRONT' }, ia)
    expect(f.locationCoefficient).toBe(1.1)
    expect(f.floor).toBe(9); expect(f.age).toBe(5)
    expect(f.quality).toBe('EXCELLENT')
    expect(f.conservationState).toBe('STATE_2'); expect(f.disposition).toBe('FRONT')
  })
  it('un piso 0 (planta baja) y una antigüedad 0 (a estrenar) cuentan como cargados', () => {
    const f = fusionarInterpretacion({ coveredArea: 55, floor: 0, age: 0 }, ia)
    expect(f.floor).toBe(0); expect(f.age).toBe(0)
  })
  it('un texto vacío cuenta como no cargado', () => {
    const f = fusionarInterpretacion({ coveredArea: 55, quality: '' as unknown as 'GOOD' }, ia)
    expect(f.quality).toBe('EXCELLENT')
  })
})

describe('correrTasadorIA', () => {
  const chatOk: ChatTasador = async () => ({
    content: JSON.stringify(respuestaOk()), provider: 'openai', model: 'gpt-x',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  })

  it('devuelve un ValuationResult calculado por la calculadora con las features fusionadas', async () => {
    const r = await correrTasadorIA(entrada, { chat: chatOk, ahora: () => new Date('2026-09-10T12:00:00Z') })
    const esperado = calculateValuation({
      subject: { ...subject, features: r.ai.subject.features },
      comparables: comparables.map((c, i) => ({ ...c, features: r.ai.comparables[i].features })),
      expenseRates: entrada.expenseRates,
    })
    expect(r.publicationPrice).toBe(esperado?.publicationPrice)
    expect(r.subjectQualityCoef).toBe(1.075)           // GOOD del asesor, aunque la IA dijo VERY_GOOD
    expect(r.comparableAnalysis[0].qualityCoefficient).toBe(1.0)   // GOOD_ECONOMIC del asesor, aunque la IA dijo GOOD
    expect(r.comparableAnalysis[2].qualityCoefficient).toBe(0.9)   // el comparable C no tenía calidad: ECONOMIC de la IA
    expect(r.comparableAnalysis[2].locationCoefficient).toBe(0.95) // ubicación sin cargar: la decide la IA
    expect(r.ai.confidence).toBe('media')
    expect(r.ai.model).toBe('gpt-x')
    expect(r.ai.generatedAt).toBe('2026-09-10T12:00:00.000Z')
    expect(r.ai.inputFingerprint).toBe(huellaDeInsumos({ subject, comparables, expenseRates: entrada.expenseRates, ownerSharePercent: 100 }))
    expect(r.ownerSharePercent).toBe(100)
    expect(r.ai.comparables[1].reasoning).toBe('c1')
    expect(r.ai.usage?.totalTokens).toBe(15)
  })
  it('hace UNA sola llamada, en modo JSON y con techo de tiempo', async () => {
    const llamadas: unknown[] = []
    const chat: ChatTasador = async (i) => { llamadas.push(i); return chatOk(i) }
    await correrTasadorIA(entrada, { chat })
    expect(llamadas).toHaveLength(1)
    const i = llamadas[0] as { jsonMode: boolean; timeoutMs: number; temperature: number }
    expect(i.jsonMode).toBe(true); expect(i.timeoutMs).toBe(20_000); expect(i.temperature).toBeLessThanOrEqual(0.3)
  })
  it('falla con mensaje legible si el modelo devuelve algo inválido', async () => {
    const chat: ChatTasador = async () => ({ content: '{"subject":{}}', provider: 'openai', model: 'm' })
    await expect(correrTasadorIA(entrada, { chat })).rejects.toThrow(/Tasador IA/)
  })
  it('falla si el modelo no devuelve JSON', async () => {
    const chat: ChatTasador = async () => ({ content: 'no puedo', provider: 'openai', model: 'm' })
    await expect(correrTasadorIA(entrada, { chat })).rejects.toThrow(/JSON/)
  })
  it('falla si hay menos de 3 comparables', async () => {
    await expect(correrTasadorIA({ ...entrada, comparables: comparables.slice(0, 2) }, { chat: chatOk })).rejects.toThrow(/3 comparables/)
  })
  it('no deja pasar comparables sin precio o sin superficie (la calculadora los saltearía y los índices se correrían)', async () => {
    const sinPrecio = { ...entrada, comparables: [...comparables, { ...comparables[0], price: null }] }
    await expect(correrTasadorIA(sinPrecio, { chat: chatOk })).rejects.toThrow(/precio|superficie/i)
  })
})
