import { describe, it, expect } from 'vitest'
import { esquemaCambios, validarIds, expensasDesdeCambio, expensasMlValidas } from './edicion-validacion'

describe('validación de la edición', () => {
  it('rechaza títulos largos y descripciones de más de 5000', () => {
    expect(esquemaCambios(60).safeParse({ cambios: { titulo: 'x'.repeat(61), valores: {} } }).success).toBe(false)
    expect(esquemaCambios(60).safeParse({ cambios: { descripcion: 'x'.repeat(5001), valores: {} } }).success).toBe(false)
  })
  it('rechaza ids que la categoría no acepta y vaciar cuando no se puede', () => {
    expect(validarIds({ INVENTADO: { value_name: '1' } }, new Set(['ROOMS']), true)).toMatch(/INVENTADO/)
    expect(validarIds({ ROOMS: null }, new Set(['ROOMS']), false)).toMatch(/vaciar/)
    expect(validarIds({ ROOMS: { value_name: '2' } }, new Set(['ROOMS']), false)).toBeNull()
  })
  it('expensas: interpreta el formato argentino, no el punto decimal de JS', () => {
    expect(expensasDesdeCambio({ value_name: '600000 ARS' })).toBe(600000)
    expect(expensasDesdeCambio({ value_name: '600.000' })).toBe(600000)
    expect(expensasDesdeCambio({ value_name: '600.000,50' })).toBe(600001) // redondea a pesos enteros
  })
  it('expensas: "0" o vacío es vaciar; sin tocar cuando no se puede interpretar', () => {
    expect(expensasDesdeCambio(null)).toBeNull()
    expect(expensasDesdeCambio({ value_name: '' })).toBeNull()
    expect(expensasDesdeCambio({ value_name: '0' })).toBeNull()
    expect(expensasDesdeCambio(undefined)).toBeUndefined()
    expect(expensasDesdeCambio({ value_id: 'x' })).toBeUndefined() // solo value_id: no hay número
    expect(expensasDesdeCambio({ value_name: '-' })).toBeUndefined() // no interpretable (NaN)
  })
  it('expensasMlValidas: acepta lo que normalizeUnit sabe convertir (incluido "$" a mano)', () => {
    expect(expensasMlValidas({ value_name: '600000' })).toBe(true)
    expect(expensasMlValidas({ value_name: '600.000' })).toBe(true)
    expect(expensasMlValidas({ value_name: '$345.678' })).toBe(true)
    expect(expensasMlValidas({ value_name: '500 USD' })).toBe(true)
    expect(expensasMlValidas({ value_name: 'US$ 500' })).toBe(true)
  })
  it('expensasMlValidas: rechaza texto que ML descartaría en silencio', () => {
    expect(expensasMlValidas({ value_name: 'A convenir' })).toBe(false)
    expect(expensasMlValidas({ value_name: '500 EUR' })).toBe(false)
  })
  it('expensasMlValidas: nada que validar cuando no hay texto (no tocar, vaciar, o solo value_id)', () => {
    expect(expensasMlValidas(undefined)).toBe(true)
    expect(expensasMlValidas(null)).toBe(true)
    expect(expensasMlValidas({ value_name: '' })).toBe(true)
    expect(expensasMlValidas({ value_id: 'x' })).toBe(true)
  })
})
