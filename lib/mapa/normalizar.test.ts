import { describe, it, expect } from 'vitest'
import { lineaDeRuta, lineaDeColectivo, ordenarLineasColectivo } from './normalizar'

describe('lineaDeRuta (subte y tren)', () => {
  it('toma el nombre antes de los dos puntos', () => {
    expect(lineaDeRuta({ name: 'Línea B: Leandro N. Alem → Juan Manuel de Rosas', ref: 'B' })).toBe('Línea B')
    expect(lineaDeRuta({ name: 'Línea Mitre: Retiro → José León Suárez' })).toBe('Línea Mitre')
  })
  it('sin nombre usa la referencia', () => {
    expect(lineaDeRuta({ ref: 'A' })).toBe('Línea A')
    expect(lineaDeRuta({})).toBeUndefined()
  })
})

describe('lineaDeColectivo', () => {
  it('saca el ramal de la referencia', () => {
    expect(lineaDeColectivo({ ref: '24-1' })).toBe('24')
    expect(lineaDeColectivo({ ref: '160AG' })).toBe('160')
    expect(lineaDeColectivo({ ref: '007' })).toBe('7')
  })
  it('sin referencia la saca del nombre', () => {
    expect(lineaDeColectivo({ name: 'Línea 105: Plaza del Correo → Caseros' })).toBe('105')
  })
  it('sin nada devuelve undefined', () => {
    expect(lineaDeColectivo({ name: 'Servicio especial' })).toBeUndefined()
  })
})

describe('ordenarLineasColectivo', () => {
  it('sin repetir y en orden numérico', () => {
    expect(ordenarLineasColectivo(['160', '19', '24', '19', '105'])).toEqual(['19', '24', '105', '160'])
  })
})
