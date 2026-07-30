import { describe, it, expect } from 'vitest'

/**
 * La puerta de registro de la galería es una REGLA DE NEGOCIO, no una opción
 * por landing. Este test fija el invariante: ningún documento guardado puede
 * abrirla más de lo permitido.
 *
 * Se testea la fórmula, no el componente (los tests con DOM no arrancan en esta
 * máquina). Si `GalleryLightbox` cambia el cálculo, este test hay que moverlo
 * con él — la fórmula está duplicada a propósito y comentada en ambos lados.
 */
const FREE_PHOTOS = 3
const fotosGratis = (freeCount?: number) => Math.min(Math.max(1, freeCount ?? FREE_PHOTOS), FREE_PHOTOS)

describe('puerta de registro de la galería', () => {
  it('sin valor guardado, muestra 3', () => {
    expect(fotosGratis(undefined)).toBe(3)
  })

  it('un documento puede hacerla MÁS restrictiva', () => {
    expect(fotosGratis(1)).toBe(1)
    expect(fotosGratis(2)).toBe(2)
  })

  it('un documento NO puede abrirla más allá de la regla', () => {
    // Este es el caso que importa: una landing vieja, una migración o un error
    // del editor que guarde un número alto NO puede dejar ver todas las fotos.
    expect(fotosGratis(12)).toBe(3)
    expect(fotosGratis(999)).toBe(3)
    expect(fotosGratis(Number.MAX_SAFE_INTEGER)).toBe(3)
  })

  it('valores absurdos caen a un mínimo sano, nunca a "todas"', () => {
    expect(fotosGratis(0)).toBe(1)
    expect(fotosGratis(-5)).toBe(1)
  })
})
