import { describe, it, expect } from 'vitest'
import { formatearMiles, parsearMonto } from './money-input'

describe('formatearMiles', () => {
  it('agrupa de a miles mientras se escribe', () => {
    expect(formatearMiles('1')).toBe('1')
    expect(formatearMiles('12')).toBe('12')
    expect(formatearMiles('129')).toBe('129')
    expect(formatearMiles('1290')).toBe('1.290')
    expect(formatearMiles('129000')).toBe('129.000')
    expect(formatearMiles('1290000')).toBe('1.290.000')
  })

  it('1.290.000 y 129.000 se distinguen a simple vista — el punto de todo esto', () => {
    expect(formatearMiles('1290000')).not.toBe(formatearMiles('129000'))
  })

  it('tolera que la persona escriba los puntos de miles', () => {
    expect(formatearMiles('1.290.000')).toBe('1.290.000')
    expect(formatearMiles('1290.000')).toBe('1.290.000')
  })

  it('ignora letras, símbolos y espacios pegados', () => {
    expect(formatearMiles('US$ 1290000')).toBe('1.290.000')
    expect(formatearMiles('abc')).toBe('')
  })

  it('campo vacío queda vacío', () => {
    expect(formatearMiles('')).toBe('')
  })

  it('no deja ceros a la izquierda', () => {
    expect(formatearMiles('0001290000')).toBe('1.290.000')
    expect(formatearMiles('0')).toBe('0')
  })
})

describe('parsearMonto', () => {
  it('lee el número atrás del formato', () => {
    expect(parsearMonto('1.290.000')).toBe(1290000)
    expect(parsearMonto('1290000')).toBe(1290000)
    expect(parsearMonto('US$ 1.290.000')).toBe(1290000)
  })

  it('vacío o sin dígitos es null, nunca cero', () => {
    // Devolver 0 haría que un campo vacío pareciera "precio cero".
    expect(parsearMonto('')).toBeNull()
    expect(parsearMonto('abc')).toBeNull()
    expect(parsearMonto('.')).toBeNull()
  })

  it('cero es null: no es un precio', () => {
    expect(parsearMonto('0')).toBeNull()
  })

  it('un número imposible de grande es null', () => {
    expect(parsearMonto('9'.repeat(20))).toBeNull()
  })
})
