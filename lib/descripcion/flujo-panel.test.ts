import { describe, it, expect } from 'vitest'
import { siguientePaso, debePedirCorreccion, respuestasParaEnviar, etiquetaFuente } from './flujo-panel'

describe('siguientePaso', () => {
  it('después de las fotos va la zona', () => {
    expect(siguientePaso('fotos', { pendientes: 0 })).toBe('zona')
  })
  it('después de la zona pregunta solo si falta algo', () => {
    expect(siguientePaso('zona', { pendientes: 2 })).toBe('preguntas')
    expect(siguientePaso('zona', { pendientes: 0 })).toBe('escribir')
  })
  it('después de las preguntas escribe, y después de escribir muestra la vista previa', () => {
    expect(siguientePaso('preguntas', { pendientes: 2 })).toBe('escribir')
    expect(siguientePaso('escribir', { pendientes: 0 })).toBe('vista')
  })
})

describe('debePedirCorreccion', () => {
  it('pide UNA corrección si hubo problemas', () => {
    expect(debePedirCorreccion(['adjetivo prohibido: "una joya"'], false)).toBe(true)
  })
  it('no pide otra si ya se corrigió (nunca un loop)', () => {
    expect(debePedirCorreccion(['adjetivo prohibido: "una joya"'], true)).toBe(false)
  })
  it('sin problemas no pide nada', () => {
    expect(debePedirCorreccion([], false)).toBe(false)
  })
})

describe('respuestasParaEnviar', () => {
  it('manda solo las preguntas pendientes con texto, recortado', () => {
    expect(respuestasParaEnviar(
      [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
      { q1: '  Pareja joven ', q2: '   ', q3: 'Precio', q4: 'no se preguntó' },
    )).toEqual({ q1: 'Pareja joven', q3: 'Precio' })
  })
})

describe('etiquetaFuente', () => {
  it('dice de dónde salió cada respuesta', () => {
    expect(etiquetaFuente('propiedad')).toBe('de la ficha')
    expect(etiquetaFuente('visita')).toBe('de la visita')
    expect(etiquetaFuente('landing')).toBe('de la landing')
  })
})
