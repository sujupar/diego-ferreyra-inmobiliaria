import { describe, expect, it } from 'vitest'
import { enlaceTel, telefonoParaMostrar } from './telefono-ficha'

describe('telefonoParaMostrar', () => {
  it('un celular de Buenos Aires se lee "11 5555-0142"', () => {
    expect(telefonoParaMostrar('+5491155550142')).toBe('11 5555-0142')
    expect(telefonoParaMostrar('11 5555 0142')).toBe('11 5555-0142')
  })
  it('otra característica se muestra como está guardada (no se adivina dónde corta)', () => {
    expect(telefonoParaMostrar('+54 9 2954 123456')).toBe('+54 9 2954 123456')
  })
  it('vacío o nulo da null', () => {
    expect(telefonoParaMostrar(null)).toBeNull()
    expect(telefonoParaMostrar('  ')).toBeNull()
  })
})

describe('enlaceTel', () => {
  it('con + se respeta el número internacional', () => {
    expect(enlaceTel('+54 9 11 5555-0142')).toBe('tel:+5491155550142')
  })
  it('10 dígitos sin prefijo se marcan como celular argentino', () => {
    expect(enlaceTel('11 5555 0142')).toBe('tel:+5491155550142')
  })
  it('otro formato: solo los dígitos', () => {
    expect(enlaceTel('4555-0142')).toBe('tel:45550142')
  })
})
