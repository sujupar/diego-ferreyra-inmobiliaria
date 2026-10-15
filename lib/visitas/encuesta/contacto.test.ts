import { describe, it, expect } from 'vitest'
import { enmascararTelefono } from './contacto'

describe('enmascararTelefono', () => {
  it('muestra el área y los últimos 4, nunca el número entero', () => {
    expect(enmascararTelefono('+5491158234521')).toBe('11 ••••-4521')
    expect(enmascararTelefono('5492214567890')).toBe('22 ••••-7890')
  })
  it('un número corto o vacío no se inventa', () => {
    expect(enmascararTelefono('4567')).toBeNull()
    expect(enmascararTelefono(null)).toBeNull()
    expect(enmascararTelefono('44652269')).toBe('••••-2269')
  })
})
