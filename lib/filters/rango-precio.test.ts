import { describe, it, expect } from 'vitest'
import {
  MAX_PRECIO,
  normalizarPrecioTexto,
  parsearPrecio,
  rangoInvertido,
} from './rango-precio'

describe('normalizarPrecioTexto', () => {
  it('deja pasar un numero limpio', () => {
    expect(normalizarPrecioTexto('150000')).toBe('150000')
  })

  it('entiende el punto de miles argentino', () => {
    // Nadie escribe 150000. En Argentina se escribe 150.000, y `Number()`
    // eso lo lee como 150 — filtrar desde 150 dolares en vez de 150 mil.
    expect(normalizarPrecioTexto('150.000')).toBe('150000')
  })

  it('entiende la coma de miles', () => {
    expect(normalizarPrecioTexto('150,000')).toBe('150000')
  })

  it('ignora el simbolo de moneda y los espacios', () => {
    expect(normalizarPrecioTexto('US$ 150.000')).toBe('150000')
  })

  it('devuelve vacio cuando no hay ningun numero', () => {
    expect(normalizarPrecioTexto('abc')).toBe('')
    expect(normalizarPrecioTexto('')).toBe('')
  })

  it('saca los ceros de la izquierda', () => {
    expect(normalizarPrecioTexto('007')).toBe('7')
  })

  it('recorta un numero absurdo al tope', () => {
    expect(normalizarPrecioTexto('9'.repeat(20))).toBe(String(MAX_PRECIO))
  })

  it('es idempotente — el contrato del hook de filtros lo exige', () => {
    for (const entrada of ['150.000', 'US$ 150.000', '007', '9'.repeat(20), 'abc', '']) {
      const unaVez = normalizarPrecioTexto(entrada)
      expect(normalizarPrecioTexto(unaVez)).toBe(unaVez)
    }
  })
})

describe('parsearPrecio', () => {
  it('devuelve el numero', () => {
    expect(parsearPrecio('150000')).toBe(150000)
  })

  it('devuelve null cuando no hay numero', () => {
    expect(parsearPrecio('')).toBe(null)
    expect(parsearPrecio('abc')).toBe(null)
  })

  it('devuelve null con null o undefined', () => {
    expect(parsearPrecio(null)).toBe(null)
    expect(parsearPrecio(undefined)).toBe(null)
  })

  it('nunca devuelve un negativo — el signo no es un digito', () => {
    expect(parsearPrecio('-500')).toBe(500)
  })

  it('nunca devuelve NaN ni Infinity', () => {
    for (const entrada of ['NaN', 'Infinity', '1e999', 'null']) {
      const valor = parsearPrecio(entrada)
      expect(valor === null || Number.isSafeInteger(valor)).toBe(true)
    }
  })
})

describe('rangoInvertido', () => {
  it('avisa cuando el minimo supera al maximo', () => {
    expect(rangoInvertido('300000', '100000')).toBe(true)
  })

  it('no avisa con el rango bien puesto', () => {
    expect(rangoInvertido('100000', '300000')).toBe(false)
  })

  it('no avisa con los dos iguales', () => {
    expect(rangoInvertido('100000', '100000')).toBe(false)
  })

  it('no avisa si falta alguna punta', () => {
    expect(rangoInvertido('', '100000')).toBe(false)
    expect(rangoInvertido('100000', '')).toBe(false)
    expect(rangoInvertido('', '')).toBe(false)
  })
})
