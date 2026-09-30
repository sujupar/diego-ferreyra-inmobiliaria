import { describe, it, expect } from 'vitest'
import { esquemaCambios, validarIds, expensasDesdeCambio } from './edicion-validacion'

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
})
