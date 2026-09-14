import { describe, it, expect } from 'vitest'
import { puedeSaltarA, alcanzadaTras } from './wizard-etapas'

/**
 * Regla del stepper clickeable (pedido del dueño, 2026-09-14): se puede volver
 * a cualquier etapa ya vista; hacia adelante solo hasta la más lejana alcanzada
 * y solo si la etapa actual está completa. Nunca se saltea una etapa que no se
 * vio, porque cada una valida lo suyo antes de publicar.
 */
describe('puedeSaltarA', () => {
  it('hacia atrás siempre se puede, aunque la etapa actual esté incompleta', () => {
    expect(puedeSaltarA({ destino: 0, actual: 3, maxAlcanzada: 3, actualValida: false })).toBe(true)
    expect(puedeSaltarA({ destino: 2, actual: 3, maxAlcanzada: 4, actualValida: false })).toBe(true)
  })

  it('hacia adelante solo hasta la más lejana alcanzada', () => {
    expect(puedeSaltarA({ destino: 3, actual: 1, maxAlcanzada: 3, actualValida: true })).toBe(true)
    expect(puedeSaltarA({ destino: 4, actual: 1, maxAlcanzada: 3, actualValida: true })).toBe(false)
  })

  it('hacia adelante exige que la etapa actual esté completa', () => {
    expect(puedeSaltarA({ destino: 2, actual: 1, maxAlcanzada: 3, actualValida: false })).toBe(false)
  })

  it('quedarse en la misma etapa no es un salto', () => {
    expect(puedeSaltarA({ destino: 2, actual: 2, maxAlcanzada: 2, actualValida: false })).toBe(false)
  })

  it('un destino fuera de rango nunca se permite', () => {
    expect(puedeSaltarA({ destino: -1, actual: 2, maxAlcanzada: 5, actualValida: true })).toBe(false)
  })
})

describe('alcanzadaTras', () => {
  it('la más lejana solo crece', () => {
    expect(alcanzadaTras(2, 3)).toBe(3)
    expect(alcanzadaTras(4, 1)).toBe(4)
  })
})
