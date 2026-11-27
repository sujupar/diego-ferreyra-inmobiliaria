import { describe, it, expect } from 'vitest'
import { UMBRAL_SEGUNDOS, mostrarQuePasaAhora, segundosDelAvance } from './mostrar-bloque'

describe('"Qué pasa ahora" aparece a los 30 segundos de video reproducido', () => {
  it('el umbral es 30', () => expect(UMBRAL_SEGUNDOS).toBe(30))

  it('no aparece antes de los 30 segundos', () => {
    expect(mostrarQuePasaAhora({ segundosEnEstaVisita: 0, segundosPrevios: 0 })).toBe(false)
    expect(mostrarQuePasaAhora({ segundosEnEstaVisita: 29.9, segundosPrevios: 0 })).toBe(false)
  })

  it('aparece a los 30', () => {
    expect(mostrarQuePasaAhora({ segundosEnEstaVisita: 30, segundosPrevios: 0 })).toBe(true)
  })

  it('si ya los había visto otro día, aparece desde que entra', () => {
    expect(mostrarQuePasaAhora({ segundosEnEstaVisita: 0, segundosPrevios: 120 })).toBe(true)
  })
})

describe('segundos reproducidos: adelantar no cuenta', () => {
  it('suma el avance normal de la reproducción', () => {
    expect(segundosDelAvance(10, 10.25)).toBeCloseTo(0.25)
    expect(segundosDelAvance(10, 11.4)).toBeCloseTo(1.4)
  })

  it('un salto hacia adelante de más de 1,5 s no suma', () => {
    expect(segundosDelAvance(3, 300)).toBe(0)
    expect(segundosDelAvance(3, 4.6)).toBe(0)
  })

  it('volver atrás o quedarse quieto no suma', () => {
    expect(segundosDelAvance(10, 5)).toBe(0)
    expect(segundosDelAvance(10, 10)).toBe(0)
  })
})
