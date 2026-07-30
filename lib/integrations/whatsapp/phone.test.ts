import { describe, it, expect } from 'vitest'
import { normalizeWhatsappPhone, isWhatsappUsable } from './phone'

describe('normalizeWhatsappPhone', () => {
  it('respeta el indicativo explícito del exterior (el bug que rompió la prueba real)', () => {
    // Este número colombiano se convertía en 543107822955 (argentino inexistente).
    expect(normalizeWhatsappPhone('+57 310 782 2955')).toBe('573107822955')
    expect(normalizeWhatsappPhone('+573107822955')).toBe('573107822955')
  })

  it('asume Argentina cuando NO hay indicativo', () => {
    expect(normalizeWhatsappPhone('11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('1161234567')).toBe('5491161234567')
  })

  it('emite el 9 canónico de los móviles argentinos', () => {
    expect(normalizeWhatsappPhone('+54 11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('+54 9 11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('+54 351 555 1234')).toBe('5493515551234')
  })

  it('saca el 15 de los móviles escritos a la vieja usanza', () => {
    expect(normalizeWhatsappPhone('011 15 6123 4567')).toBe('5491161234567')
  })

  it('devuelve null en vez de inventar cuando no es un número válido', () => {
    expect(normalizeWhatsappPhone('3107822955')).toBeNull() // 10 dígitos que no son AR válido
    expect(normalizeWhatsappPhone('+54 11 1234 5678')).toBeNull() // relleno, no existe
    expect(normalizeWhatsappPhone('123')).toBeNull()
    expect(normalizeWhatsappPhone('no es un teléfono')).toBeNull()
    expect(normalizeWhatsappPhone('')).toBeNull()
    expect(normalizeWhatsappPhone(null)).toBeNull()
  })

  it('isWhatsappUsable es el mismo criterio', () => {
    expect(isWhatsappUsable('+57 310 782 2955')).toBe(true)
    expect(isWhatsappUsable('3107822955')).toBe(false)
  })
})
