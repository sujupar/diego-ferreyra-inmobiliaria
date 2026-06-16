import { describe, it, expect } from 'vitest'
import { normalizeArPhone } from './normalize-phone'

describe('normalizeArPhone', () => {
  it('celular CABA con +54 9 11 y separadores → 5491112345678', () => {
    expect(normalizeArPhone('+54 9 11 1234-5678')).toBe('5491112345678')
  })
  it('formato local 011 15-1234-5678 → 5491112345678', () => {
    expect(normalizeArPhone('011 15-1234-5678')).toBe('5491112345678')
  })
  it('ya normalizado 5491112345678 → se mantiene', () => {
    expect(normalizeArPhone('5491112345678')).toBe('5491112345678')
  })
  it('11 1234 5678 (sin país) → 54 + 9 + 1112345678', () => {
    expect(normalizeArPhone('11 1234 5678')).toBe('5491112345678')
  })
  it('vacío/sin dígitos → cadena vacía', () => {
    expect(normalizeArPhone('')).toBe('')
    expect(normalizeArPhone('abc')).toBe('')
  })
  it('número ya con país no-AR (ej 1 555...) → conserva dígitos, no fuerza 54', () => {
    expect(normalizeArPhone('+1 555 111 2222')).toBe('15551112222')
  })
})
