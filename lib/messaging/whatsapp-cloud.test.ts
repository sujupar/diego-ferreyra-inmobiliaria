import { describe, it, expect } from 'vitest'
import { normalizePhone } from './whatsapp-cloud'

describe('normalizePhone', () => {
  it('null/undefined/empty → null', () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })

  it('numero ya con 54 lo respeta', () => {
    expect(normalizePhone('+54 11 4567 8901')).toBe('541145678901')
    expect(normalizePhone('5491145678901')).toBe('5491145678901')
  })

  it('10 dígitos (sin código país) → prepend 54', () => {
    expect(normalizePhone('1145678901')).toBe('541145678901')
  })

  it('11 dígitos con 0 inicial → strip 0 + prepend 54', () => {
    expect(normalizePhone('01145678901')).toBe('541145678901')
  })

  it('formato con guiones y espacios se limpia', () => {
    expect(normalizePhone('+54 9 11 4567-8901')).toBe('5491145678901')
    expect(normalizePhone('(011) 4567-8901')).toBe('541145678901')
  })

  it('sin código país de 12+ dígitos prepend 54', () => {
    expect(normalizePhone('9111234567890')).toBe('549111234567890')
  })

  it('celular BA viejo con 15 inicial → strip 15 + prepend 5411', () => {
    expect(normalizePhone('1512345678')).toBe('541112345678')
  })

  it('celular BA con 011-15 → strip ambos prefijos', () => {
    expect(normalizePhone('011-15-1234-5678')).toBe('54111512345678')
  })
})
