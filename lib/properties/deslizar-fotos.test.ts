import { describe, it, expect } from 'vitest'
import { direccionDeslizada, MIN_DESLIZAMIENTO_PX } from './deslizar-fotos'

describe('direccionDeslizada', () => {
  it('arrastrar hacia la izquierda trae la foto siguiente', () => {
    expect(direccionDeslizada(-80, 0)).toBe('siguiente')
  })

  it('arrastrar hacia la derecha vuelve a la anterior', () => {
    expect(direccionDeslizada(80, 0)).toBe('anterior')
  })

  it('un toque quieto no cambia de foto', () => {
    expect(direccionDeslizada(0, 0)).toBeNull()
  })

  it('por debajo del umbral es un toque, no un deslizamiento', () => {
    expect(direccionDeslizada(-(MIN_DESLIZAMIENTO_PX - 1), 0)).toBeNull()
    expect(direccionDeslizada(MIN_DESLIZAMIENTO_PX - 1, 0)).toBeNull()
    // Justo en el umbral ya cuenta.
    expect(direccionDeslizada(-MIN_DESLIZAMIENTO_PX, 0)).toBe('siguiente')
  })

  it('un gesto vertical no salta de foto (aunque tenga componente horizontal)', () => {
    // Bajar 200px arrastrando 60 de costado: eso es scroll/cerrar, no "siguiente".
    expect(direccionDeslizada(-60, 200)).toBeNull()
    expect(direccionDeslizada(60, -200)).toBeNull()
  })

  it('en la diagonal exacta manda el eje vertical', () => {
    expect(direccionDeslizada(-100, 100)).toBeNull()
    expect(direccionDeslizada(-101, 100)).toBe('siguiente')
  })
})
