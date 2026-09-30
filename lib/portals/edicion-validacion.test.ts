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
  it('expensas: número, vacío o sin tocar', () => {
    expect(expensasDesdeCambio({ value_name: '600.000 ARS' })).toBe(600000)
    expect(expensasDesdeCambio(null)).toBeNull()
    expect(expensasDesdeCambio(undefined)).toBeUndefined()
  })
})
