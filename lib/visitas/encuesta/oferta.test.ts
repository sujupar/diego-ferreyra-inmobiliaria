import { describe, it, expect } from 'vitest'
import { atajosDeOferta, textoMonto } from './oferta'

describe('atajosDeOferta', () => {
  it('−10 %, −5 % y el publicado, redondeados (USD a 1.000)', () => {
    expect(atajosDeOferta(149_900, 'USD')).toEqual([
      { etiqueta: '−10 %', monto: 135_000 },
      { etiqueta: '−5 %', monto: 142_000 },
      { etiqueta: 'Precio publicado', monto: 150_000 },
    ])
  })
  it('en pesos redondea a 100.000', () => {
    expect(atajosDeOferta(98_450_000, 'ARS')[2]).toEqual({ etiqueta: 'Precio publicado', monto: 98_500_000 })
  })
  it('sin precio (o precio inválido) no hay atajos', () => {
    expect(atajosDeOferta(null, 'USD')).toEqual([])
    expect(atajosDeOferta(0, 'USD')).toEqual([])
    expect(atajosDeOferta(Number.NaN, 'USD')).toEqual([])
  })
  it('un precio muy bajo no repite el mismo atajo', () => {
    const a = atajosDeOferta(1_000, 'USD')
    expect(new Set(a.map(x => x.monto)).size).toBe(a.length)
  })
})

describe('textoMonto', () => {
  it('agrupado como se escribe en Argentina', () => {
    expect(textoMonto(1_290_000, 'USD')).toBe('US$ 1.290.000')
    expect(textoMonto(98_500_000, 'ARS')).toBe('$ 98.500.000')
  })
})
