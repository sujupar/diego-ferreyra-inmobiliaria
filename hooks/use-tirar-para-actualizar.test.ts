import { describe, it, expect } from 'vitest'
import {
  arranqueValido,
  distanciaVisible,
  estadoDelTiron,
  alcanzaParaRefrescar,
  DISTANCIA_PARA_SOLTAR,
  DISTANCIA_MAXIMA,
  FACTOR_RESISTENCIA,
} from './use-tirar-para-actualizar'

/**
 * Estas reglas son las que deciden si el gesto se roba o no el toque del
 * usuario. No hay navegador donde mirarlo, y equivocarse acá no se ve como un
 * error: se ve como "el teléfono dejó de responder al volver".
 */
describe('arranqueValido — cuándo el tirón se apropia del gesto', () => {
  it('lista arriba de todo + dedo claramente hacia abajo → es un tirón', () => {
    expect(arranqueValido({ scrollTop: 0, dx: 2, dy: 40 })).toBe(true)
  })

  it('la lista NO está arriba de todo → es scroll, no tirón', () => {
    expect(arranqueValido({ scrollTop: 120, dx: 0, dy: 40 })).toBe(false)
    // Ni siquiera un píxel: si ya se scrolleó algo, el gesto es del scroll.
    expect(arranqueValido({ scrollTop: 1, dx: 0, dy: 40 })).toBe(false)
  })

  it('el dedo va hacia arriba → nunca', () => {
    expect(arranqueValido({ scrollTop: 0, dx: 0, dy: -40 })).toBe(false)
    expect(arranqueValido({ scrollTop: 0, dx: 0, dy: 0 })).toBe(false)
  })

  // ESTE es el test que protege el gesto de volver: deslizar desde el borde
  // izquierdo es horizontal, y si el tirón se lo apropiara llamaría a
  // `preventDefault` y el usuario se quedaría sin la forma más automática que
  // existe de salir de una pantalla en un teléfono.
  it('un deslizamiento horizontal (el de volver) NO es un tirón, ni con algo de vertical', () => {
    expect(arranqueValido({ scrollTop: 0, dx: 120, dy: 0 })).toBe(false)
    expect(arranqueValido({ scrollTop: 0, dx: 120, dy: 30 })).toBe(false)
    expect(arranqueValido({ scrollTop: 0, dx: -120, dy: 30 })).toBe(false)
  })

  it('en la diagonal exacta gana el scroll/deslizamiento, no el tirón', () => {
    expect(arranqueValido({ scrollTop: 0, dx: 40, dy: 40 })).toBe(false)
    expect(arranqueValido({ scrollTop: 0, dx: -40, dy: 40 })).toBe(false)
  })
})

describe('distanciaVisible — la resistencia', () => {
  it('el indicador avanza la mitad que el dedo', () => {
    expect(distanciaVisible(40)).toBe(40 * FACTOR_RESISTENCIA)
  })

  it('nunca crece más allá del tope', () => {
    expect(distanciaVisible(10_000)).toBe(DISTANCIA_MAXIMA)
  })

  it('hacia arriba no dibuja nada', () => {
    expect(distanciaVisible(-50)).toBe(0)
    expect(distanciaVisible(0)).toBe(0)
  })

  it('el umbral es alcanzable: hay un recorrido de dedo que lo cruza', () => {
    // Si la resistencia y el tope se movieran de forma incompatible con el
    // umbral, el gesto quedaría imposible de completar y nadie se enteraría.
    expect(distanciaVisible(DISTANCIA_PARA_SOLTAR / FACTOR_RESISTENCIA)).toBeGreaterThanOrEqual(DISTANCIA_PARA_SOLTAR)
    expect(DISTANCIA_MAXIMA).toBeGreaterThanOrEqual(DISTANCIA_PARA_SOLTAR)
  })
})

describe('umbral y estado del indicador', () => {
  it('justo en el umbral ya alcanza; un píxel menos no', () => {
    expect(alcanzaParaRefrescar(DISTANCIA_PARA_SOLTAR)).toBe(true)
    expect(alcanzaParaRefrescar(DISTANCIA_PARA_SOLTAR - 1)).toBe(false)
  })

  it('el estado acompaña al recorrido', () => {
    expect(estadoDelTiron(0, false)).toBe('inactivo')
    expect(estadoDelTiron(10, false)).toBe('tirando')
    expect(estadoDelTiron(DISTANCIA_PARA_SOLTAR, false)).toBe('soltar')
  })

  it('mientras actualiza, el estado manda sobre el recorrido', () => {
    // Si no, al soltar el indicador parpadea entre "soltar" y "refrescando".
    expect(estadoDelTiron(0, true)).toBe('refrescando')
    expect(estadoDelTiron(DISTANCIA_PARA_SOLTAR, true)).toBe('refrescando')
  })
})
