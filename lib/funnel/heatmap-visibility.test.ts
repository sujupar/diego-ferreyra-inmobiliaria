/**
 * Cuándo una sección de la landing cuenta como "vista" para el mapa de calor.
 *
 * El bug que estas pruebas clavan: la regla era "se ve al menos el 50% de la
 * sección". Una sección más alta que dos pantallas NUNCA muestra su 50% a la vez,
 * así que jamás contaba como vista. Dato real del 2026-09-19, en celular:
 * "Testimonios" daba 0 de 829 sesiones en la landing A y 0 de 50 en la B, mientras
 * el botón final —que está MÁS ABAJO— tenía 8% y 20% de llegada, y Testimonios
 * tenía clics. El embudo de secciones mentía justo en las secciones largas.
 */
import { describe, it, expect } from 'vitest'
import { seccionEnVista, UMBRALES_DE_VISTA } from './heatmap-visibility'

const PANTALLA = 844 // alto de un iPhone

describe('seccionEnVista', () => {
  it('una sección corta cuenta cuando se ve al menos su mitad (regla de siempre)', () => {
    expect(seccionEnVista({ ratio: 0.5, altoVisible: 100, altoPantalla: PANTALLA })).toBe(true)
    expect(seccionEnVista({ ratio: 1, altoVisible: 200, altoPantalla: PANTALLA })).toBe(true)
    expect(seccionEnVista({ ratio: 0.49, altoVisible: 98, altoPantalla: PANTALLA })).toBe(false)
  })

  it('una sección MÁS ALTA que dos pantallas cuenta cuando ocupa media pantalla', () => {
    // Testimonios en celular: ~3000 px. Llenando la pantalla entera se ve el 28%.
    expect(seccionEnVista({ ratio: 844 / 3000, altoVisible: 844, altoPantalla: PANTALLA })).toBe(true)
    expect(seccionEnVista({ ratio: 422 / 3000, altoVisible: 422, altoPantalla: PANTALLA })).toBe(true)
  })

  it('asomar apenas por el borde NO cuenta, por alta que sea la sección', () => {
    expect(seccionEnVista({ ratio: 100 / 3000, altoVisible: 100, altoPantalla: PANTALLA })).toBe(false)
    expect(seccionEnVista({ ratio: 0, altoVisible: 0, altoPantalla: PANTALLA })).toBe(false)
  })

  it('datos rotos no cuentan como vista (mejor perder una sesión que inventarla)', () => {
    expect(seccionEnVista({ ratio: NaN, altoVisible: NaN, altoPantalla: PANTALLA })).toBe(false)
    expect(seccionEnVista({ ratio: 0.2, altoVisible: 500, altoPantalla: 0 })).toBe(false)
    expect(seccionEnVista({ ratio: 0.2, altoVisible: 500, altoPantalla: NaN })).toBe(false)
  })
})

describe('UMBRALES_DE_VISTA', () => {
  it('son finos (cada 5%): con [0, 0.5, 1] el navegador nunca avisaba a mitad de una sección alta', () => {
    expect(UMBRALES_DE_VISTA[0]).toBe(0)
    expect(UMBRALES_DE_VISTA.at(-1)).toBe(1)
    expect(UMBRALES_DE_VISTA).toContain(0.5)
    expect(UMBRALES_DE_VISTA.length).toBe(21)
    for (let i = 1; i < UMBRALES_DE_VISTA.length; i++) {
      expect(UMBRALES_DE_VISTA[i] - UMBRALES_DE_VISTA[i - 1]).toBeCloseTo(0.05, 10)
    }
  })

  it('alcanzan para cualquier alto: el navegador avisa a más tardar cuando se ve el 5% de la sección', () => {
    // Sección de 12 pantallas: media pantalla es el 4,2% de la sección. El primer aviso
    // después de 0 llega al 5% = 0,6 pantallas → ya cumple la regla de media pantalla.
    const alto = PANTALLA * 12
    const primerAviso = UMBRALES_DE_VISTA[1] * alto
    expect(seccionEnVista({ ratio: UMBRALES_DE_VISTA[1], altoVisible: primerAviso, altoPantalla: PANTALLA })).toBe(true)
  })
})
