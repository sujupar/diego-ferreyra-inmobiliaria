import { describe, it, expect } from 'vitest'
import { vslBarFraction } from './vsl-bar'

describe('vslBarFraction', () => {
  it('arranca en 0 y termina exactamente en 1', () => {
    // Que f(1) sea 1 es lo que evita que la barra mienta: llega al tope cuando
    // termina el video, no antes.
    expect(vslBarFraction(0)).toBe(0)
    expect(vslBarFraction(1)).toBe(1)
  })

  it('avanza más rápido que el video al principio', () => {
    // Es el punto de la curva: al 10% real la barra ya muestra bastante más.
    expect(vslBarFraction(0.1)).toBeGreaterThan(0.25)
    expect(vslBarFraction(0.25)).toBeGreaterThan(0.45)
  })

  it('se va frenando: cada tramo aporta menos que el anterior', () => {
    const primerCuarto = vslBarFraction(0.25) - vslBarFraction(0)
    const segundoCuarto = vslBarFraction(0.5) - vslBarFraction(0.25)
    const tercerCuarto = vslBarFraction(0.75) - vslBarFraction(0.5)
    const ultimoCuarto = vslBarFraction(1) - vslBarFraction(0.75)
    expect(segundoCuarto).toBeLessThan(primerCuarto)
    expect(tercerCuarto).toBeLessThan(segundoCuarto)
    expect(ultimoCuarto).toBeLessThan(tercerCuarto)
  })

  it('nunca retrocede', () => {
    let previo = -1
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const actual = vslBarFraction(p)
      expect(actual).toBeGreaterThanOrEqual(previo)
      previo = actual
    }
  })

  it('nunca se pasa de 1 ni baja de 0', () => {
    for (const p of [0.01, 0.37, 0.5, 0.99, 1]) {
      const f = vslBarFraction(p)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })

  it('tolera la basura que llega antes de que cargue la metadata', () => {
    // `currentTime / duration` da NaN (si currentTime es 0) o Infinity (si no)
    // mientras `duration` todavía vale 0. Los dos casos tienen que dar barra
    // VACÍA: un Infinity significa "no sé cuánto dura", y llenar la barra ahí
    // sería mostrarle al espectador que el video terminó antes de empezar.
    expect(vslBarFraction(Number.NaN)).toBe(0)
    expect(vslBarFraction(Number.POSITIVE_INFINITY)).toBe(0)
    expect(vslBarFraction(-5)).toBe(0)
    // Un valor finito por encima de 1 sí satura en 1: ahí la duración se conoce
    // y el desborde es solo redondeo del navegador al final del video.
    expect(vslBarFraction(42)).toBe(1)
  })
})
