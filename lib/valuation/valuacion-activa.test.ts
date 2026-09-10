import { describe, it, expect } from 'vitest'
import {
  valuacionActiva, preciosDesnormalizados, estadoTarjetaIA, comparablesNormales, comparablesDelSnapshotIA,
  type FilaConTasadores, type FilaComparable,
} from './valuacion-activa'
import type { ValuationResult } from './calculator'
import type { AiValuationResult } from './ia-tipos'

const clasico = {
  publicationPrice: 100_000, saleValue: 95_000, moneyInHand: 90_000, currency: 'USD', subjectSurface: 50,
  comparableAnalysis: [{ adjustedPriceM2: 1 }, { adjustedPriceM2: 2 }],
} as unknown as ValuationResult
const ia = {
  ...clasico, publicationPrice: 110_000, saleValue: 104_500, moneyInHand: 99_000,
  ai: {
    provider: 'openai', model: 'm', generatedAt: 'x', confidence: 'alta', summary: 's', inputFingerprint: 'h1',
    subject: { features: { coveredArea: 50 }, reasoning: '' },
    comparables: [
      { features: { coveredArea: 40, quality: 'EXCELLENT' }, reasoning: '' },
      { features: { coveredArea: 60 }, reasoning: '' },
    ],
  },
} as unknown as AiValuationResult
const rows: FilaComparable[] = [
  { title: 'B', location: null, url: null, price: 2, currency: 'USD', description: null, images: null, features: { coveredArea: 60 }, analysis: null, sort_order: 1 },
  { title: 'A', location: null, url: null, price: 1, currency: 'USD', description: null, images: null, features: { coveredArea: 40, quality: 'GOOD' }, analysis: null, sort_order: 0 },
  { title: 'sobre', location: null, url: null, price: 9, currency: 'USD', description: null, images: null, features: {}, analysis: { propertyType: 'overpriced' }, sort_order: 1000 },
]
const fila = (extra: Partial<FilaConTasadores>): FilaConTasadores => ({
  valuation_result: clasico, ai_valuation_result: null, ai_valuation_status: null, ai_valuation_error: null,
  valuation_source: 'calculator', updated_at: '2026-09-10T10:00:00Z', ...extra,
})

describe('comparablesNormales', () => {
  it('saca sobrevaluadas y compra, y ordena por sort_order', () => {
    expect(comparablesNormales(rows).map(r => r.title)).toEqual(['A', 'B'])
  })
})

describe('comparablesDelSnapshotIA', () => {
  it('usa la fila para título/precio y el snapshot para las features', () => {
    const c = comparablesDelSnapshotIA(rows, ia.ai)
    expect(c[0].title).toBe('A'); expect(c[0].price).toBe(1)
    expect(c[0].features.quality).toBe('EXCELLENT')
  })
})

describe('valuacionActiva', () => {
  it('por defecto es la clásica, con los comparables rehidratados desde las filas', () => {
    const v = valuacionActiva(fila({}), rows)
    expect(v.source).toBe('calculator')
    expect(v.result.publicationPrice).toBe(100_000)
    expect(v.result.comparableAnalysis[0].property.title).toBe('A')
    expect(v.result.comparableAnalysis[0].property.features.quality).toBe('GOOD')
  })
  it('con IA elegida y lista devuelve el snapshot IA con SUS features', () => {
    const v = valuacionActiva(fila({ valuation_source: 'ai', ai_valuation_result: ia, ai_valuation_status: 'ready' }), rows)
    expect(v.source).toBe('ai')
    expect(v.result.publicationPrice).toBe(110_000)
    expect(v.result.comparableAnalysis[0].property.features.quality).toBe('EXCELLENT')
  })
  it('con IA elegida pero NO lista cae a la clásica (defensa)', () => {
    const v = valuacionActiva(fila({ valuation_source: 'ai', ai_valuation_result: null, ai_valuation_status: 'failed' }), rows)
    expect(v.source).toBe('calculator')
  })
  it('no pisa un property ya presente en el resultado', () => {
    const conProp = { ...clasico, comparableAnalysis: [{ property: { title: 'ya', features: {} } }, {}] } as unknown as ValuationResult
    const v = valuacionActiva(fila({ valuation_result: conProp }), rows)
    expect(v.result.comparableAnalysis[0].property.title).toBe('ya')
    expect(v.result.comparableAnalysis[1].property.title).toBe('B')
  })
})

describe('preciosDesnormalizados', () => {
  it('toma los tres precios y la moneda', () => {
    expect(preciosDesnormalizados(ia)).toEqual({ publication_price: 110_000, sale_value: 104_500, money_in_hand: 99_000, currency: 'USD' })
  })
})

describe('estadoTarjetaIA', () => {
  const ahora = new Date('2026-09-10T10:01:00Z')
  it('sin snapshot ni estado → sin_generar', () => expect(estadoTarjetaIA(fila({}), 'h1', ahora)).toBe('sin_generar'))
  it('pending reciente → analizando', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'pending' }), 'h1', ahora)).toBe('analizando'))
  it('pending de hace más de 2 minutos → fallida (la función murió a mitad)', () =>
    expect(estadoTarjetaIA(fila({ ai_valuation_status: 'pending', updated_at: '2026-09-10T09:50:00Z' }), 'h1', ahora)).toBe('fallida'))
  it('failed → fallida', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'failed', ai_valuation_error: 'x' }), 'h1', ahora)).toBe('fallida'))
  it('ready con la misma huella → lista', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'ready', ai_valuation_result: ia }), 'h1', ahora)).toBe('lista'))
  it('ready con otra huella → desactualizada', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'ready', ai_valuation_result: ia }), 'h2', ahora)).toBe('desactualizada'))
  it('ready sin snapshot (inconsistente) → fallida', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'ready' }), 'h1', ahora)).toBe('fallida'))
})
