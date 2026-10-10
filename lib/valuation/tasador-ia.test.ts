import { describe, it, expect } from 'vitest'
import {
  armarPromptTasadorIA, validarRespuestaTasadorIA, fusionarInterpretacion, correrTasadorIA, describirMetodo,
  type EntradaTasadorIA, type ChatTasador,
} from './tasador-ia'
import { calculateValuation, type ValuationProperty } from './calculator'
import { huellaDeInsumos } from './huella-insumos'
import { planillaDelMetodo } from './planilla-ia'

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

const planillaCualquiera = () => planillaDelMetodo({ coveredArea: 50, floor: 3, age: 20 })
const interp = (i: number, extra: Record<string, unknown> = {}) => ({
  index: i, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'FRONT', floor: 3, age: 20,
  locationCoefficient: 1.0, planilla: planillaCualquiera(), reasoning: `c${i}`, ...extra,
})
const respuestaOk = () => ({
  subject: { quality: 'VERY_GOOD', conservationState: 'STATE_1', disposition: 'FRONT', floor: 4, age: 0, locationCoefficient: 1.05, planilla: planillaCualquiera(), reasoning: 'a estrenar' },
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

describe('describirMetodo — el método COMPLETO, para que la IA calcule todo (pedido del dueño 2026-10-10)', () => {
  it('lleva la tabla Ross-Heidecke entera por % de vida, no solo la fila de un edificio nuevo', () => {
    const t = describirMetodo()
    expect(t).toMatch(/43: .*32\.49/)   // fila 43 % de vida, Estado 2
    expect(t).toMatch(/99: /)
  })
  it('explica el % de vida y la regla W = 1 − K/200', () => {
    const t = describirMetodo()
    expect(t).toContain('100 × antigüedad / 70')
    expect(t).toContain('W = 1 − K / 200')
  })
  it('describe el piso como lo aplica la calculadora, sin coeficientes que la calculadora no usa', () => {
    const t = describirMetodo()
    expect(t).not.toContain('TOP_FLOOR')
    expect(t).not.toContain('GROUND_FLOOR_GARDEN')
    expect(t).toContain('vacío')
  })
  it('pide la planilla completa de coeficientes por propiedad', () => {
    const { system } = armarPromptTasadorIA(entrada)
    for (const campo of ['superficieHomologada', 'kPiso', 'kDisposicion', 'mCalidad', 'porcentajeVida', 'kTabla', 'wEdadEstado', 'jUbicacion', 'nTotal']) {
      expect(system).toContain(campo)
    }
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
  it('rechaza coeficiente de ubicación fuera de [0.85, 1.15] (spec D2)', () => {
    const r = respuestaOk(); r.subject.locationCoefficient = 1.2
    expect(() => validarRespuestaTasadorIA(r, 3)).toThrow(/locationCoefficient/i)
    const r2 = respuestaOk(); r2.comparables[0].locationCoefficient = 0.8
    expect(() => validarRespuestaTasadorIA(r2, 3)).toThrow(/locationCoefficient/i)
  })
  it('rechaza una respuesta sin la planilla de coeficientes', () => {
    const r = respuestaOk() as Record<string, any>; delete r.subject.planilla
    expect(() => validarRespuestaTasadorIA(r, 3)).toThrow(/planilla/i)
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
  it('verifica la planilla del modelo contra el método y registra las correcciones', async () => {
    const r = await correrTasadorIA(entrada, { chat: chatOk })
    // El modelo devolvió una planilla de OTRA propiedad: el piso 4 del sujeto da 1.0
    // y la superficie 60 + 8×0,5 = 64, no las de la planilla cualquiera (50 m²).
    expect(r.ai.subject.planilla?.superficieHomologada).toBe(64)
    expect(r.ai.subject.correcciones?.map(c => c.coeficiente)).toContain('superficieHomologada')
    // La planilla guardada es la del método (la que se usó), no la del modelo.
    expect(r.ai.subject.planilla?.nTotal).toBeCloseTo(r.subjectTotalCoef, 12)
  })
  it('no registra correcciones cuando el modelo calculó como el método', async () => {
    const chat: ChatTasador = async (i) => {
      const resp = respuestaOk()
      // Fusionadas como las va a fusionar el código: lo del asesor manda.
      const fs = fusionarInterpretacion(subject.features, resp.subject as never)
      resp.subject.planilla = planillaDelMetodo(fs)
      resp.comparables.forEach((c, k) => { c.planilla = planillaDelMetodo(fusionarInterpretacion(comparables[k].features, c as never)) })
      return { ...(await chatOk(i)), content: JSON.stringify(resp) }
    }
    const r = await correrTasadorIA(entrada, { chat })
    expect(r.ai.subject.correcciones).toEqual([])
    expect(r.ai.comparables.every(c => c.correcciones?.length === 0)).toBe(true)
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
