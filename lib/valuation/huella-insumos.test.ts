import { describe, it, expect } from 'vitest'
import { huellaDeInsumos, type InsumosParaHuella } from './huella-insumos'

const base: InsumosParaHuella = {
  subject: { price: null, location: 'Almagro', description: 'Luminoso', features: { coveredArea: 50, floor: 3, age: 40 } },
  comparables: [
    { price: 100_000, currency: 'USD', location: 'Almagro', description: 'a', features: { coveredArea: 48, uncoveredArea: 6, age: 30 } },
    { price: 120_000, currency: 'USD', location: 'Almagro', description: 'b', features: { coveredArea: 55, age: 10 } },
  ],
  expenseRates: { saleDiscountPercent: 5 },
  ownerSharePercent: 100,
}
const clon = (): InsumosParaHuella => JSON.parse(JSON.stringify(base))

describe('huellaDeInsumos — cambia con lo objetivo y con los juicios del asesor (que la IA respeta)', () => {
  it('es determinística', () => {
    expect(huellaDeInsumos(base)).toBe(huellaDeInsumos(clon()))
    expect(huellaDeInsumos(base)).toMatch(/^[0-9a-f]{8,16}$/)
  })
  it('cambia si cambia el precio de un comparable', () => {
    const c = clon(); c.comparables[0].price = 101_000
    expect(huellaDeInsumos(c)).not.toBe(huellaDeInsumos(base))
  })
  it('cambia si cambia una superficie, la descripción o las tasas de gastos', () => {
    const s = clon(); s.subject.features.coveredArea = 51
    const d = clon(); d.comparables[1].description = 'otra'
    const t = clon(); t.expenseRates = { saleDiscountPercent: 6 }
    for (const x of [s, d, t]) expect(huellaDeInsumos(x)).not.toBe(huellaDeInsumos(base))
  })
  it('cambia con calidad, estado, disposición o coeficiente de ubicación cargados por el asesor (la IA los respeta)', () => {
    for (const cambio of [{ quality: 'EXCELLENT' }, { conservationState: 'STATE_1' }, { disposition: 'FRONT' }, { locationCoefficient: 1.2 }]) {
      const c = clon()
      Object.assign(c.comparables[0].features, cambio)
      expect(huellaDeInsumos(c)).not.toBe(huellaDeInsumos(base))
    }
  })
  it('trata null y undefined igual, y recorta espacios de la descripción', () => {
    const c = clon(); c.subject.price = undefined; c.subject.description = '  Luminoso  '
    expect(huellaDeInsumos(c)).toBe(huellaDeInsumos(base))
  })
  it('cambia si cambia el orden de los comparables', () => {
    const c = clon(); c.comparables.reverse()
    expect(huellaDeInsumos(c)).not.toBe(huellaDeInsumos(base))
  })
  it('cambia con la parte del propietario', () => {
    const c = clon(); c.ownerSharePercent = 50
    expect(huellaDeInsumos(c)).not.toBe(huellaDeInsumos(base))
  })
})
