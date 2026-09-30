import { describe, it, expect } from 'vitest'
import { mismoValor, diferencias, sugeridosPara, aplicarCambios, numeroArgentino } from './edicion-comun'

describe('mismoValor', () => {
  it('compara por id cuando los dos tienen id', () => {
    expect(mismoValor({ value_id: '242085' }, { value_id: '242085', value_name: 'Sí' })).toBe(true)
  })
  it('ignora mayúsculas, espacios y la forma de las tildes (NFD de macOS)', () => {
    expect(mismoValor({ value_name: 'Sí' }, { value_name: ' si'.replace('i', 'í') })).toBe(true)
  })
  it('usa el normalizador para unidades', () => {
    const n = (v: string) => (/^\d+$/.test(v) ? `${v} ARS` : v)
    expect(mismoValor({ value_name: '600000' }, { value_name: '600000 ARS' }, n)).toBe(true)
  })
  it('vacío contra vacío es igual; vacío contra valor no', () => {
    expect(mismoValor(undefined, {})).toBe(true)
    expect(mismoValor(undefined, { value_name: '1' })).toBe(false)
  })
})

describe('diferencias', () => {
  it('devuelve solo lo cambiado, lo nuevo y lo vaciado (null)', () => {
    const d = diferencias(
      { ROOMS: { value_name: '4' }, HAS_LIFT: { value_name: 'No' }, FLOORS: { value_name: '9' } },
      { ROOMS: { value_name: '4' }, HAS_LIFT: { value_name: 'Sí' }, MAINTENANCE_FEE: { value_name: '1 ARS' } },
    )
    expect(d).toEqual({ HAS_LIFT: { value_name: 'Sí' }, MAINTENANCE_FEE: { value_name: '1 ARS' }, FLOORS: null })
  })
  it('sin cambios devuelve objeto vacío', () => {
    expect(diferencias({ A: { value_id: 'x' } }, { A: { value_id: 'x' } })).toEqual({})
  })
})

describe('sugeridosPara', () => {
  it('sugiere solo lo que el portal no tiene y la categoría acepta', () => {
    const s = sugeridosPara(
      { ROOMS: { value_name: '4' } },
      { ROOMS: { value_name: '5' }, MAINTENANCE_FEE: { value_name: '600000 ARS' }, INVENTADO: { value_name: 'x' } },
      new Set(['ROOMS', 'MAINTENANCE_FEE']),
    )
    expect(s).toEqual({ MAINTENANCE_FEE: { value_name: '600000 ARS' } })
  })
})

describe('aplicarCambios', () => {
  it('pisa, agrega y borra sin mutar la base', () => {
    const base = { A: { value_name: '1' }, B: { value_name: '2' } }
    const r = aplicarCambios(base, { A: { value_name: '9' }, B: null, C: { value_id: 'c' } })
    expect(r).toEqual({ A: { value_name: '9' }, C: { value_id: 'c' } })
    expect(base.B).toEqual({ value_name: '2' })
  })
})

describe('numeroArgentino', () => {
  it('miles con punto: "600.000" → 600000, no 600', () => {
    expect(numeroArgentino('600.000')).toBe(600000)
  })
  it('miles con punto + decimal con coma: "1.250.000,50"', () => {
    expect(numeroArgentino('1.250.000,50')).toBe(1250000.5)
  })
  it('decimal con coma sin miles: "600000,50"', () => {
    expect(numeroArgentino('600000,50')).toBe(600000.5)
  })
  it('ya en formato JS, con o sin sufijo ARS', () => {
    expect(numeroArgentino('600000 ARS')).toBe(600000)
    expect(numeroArgentino('600000')).toBe(600000)
  })
  it('sin dígitos da NaN', () => {
    expect(Number.isNaN(numeroArgentino('-'))).toBe(true)
  })
})
