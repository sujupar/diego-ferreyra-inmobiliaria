import { describe, it, expect } from 'vitest'
import { modoDelReel, camposDelModo, type ModoReel } from './modo'

describe('modoDelReel', () => {
  it('automatización apagada es Apagado, tenga o no el simulacro', () => {
    expect(modoDelReel({ automatizacion_activa: false, simulacro: true })).toBe('apagado')
    expect(modoDelReel({ automatizacion_activa: false, simulacro: false })).toBe('apagado')
  })

  it('activa con simulacro es Modo prueba', () => {
    expect(modoDelReel({ automatizacion_activa: true, simulacro: true })).toBe('prueba')
  })

  it('activa sin simulacro es En vivo', () => {
    expect(modoDelReel({ automatizacion_activa: true, simulacro: false })).toBe('en_vivo')
  })
})

describe('camposDelModo', () => {
  it('Apagado deja el simulacro PRENDIDO: al volver a activar, arranca en prueba y no en vivo', () => {
    expect(camposDelModo('apagado')).toEqual({ automatizacion_activa: false, simulacro: true })
  })

  it('Modo prueba = activa + simulacro', () => {
    expect(camposDelModo('prueba')).toEqual({ automatizacion_activa: true, simulacro: true })
  })

  it('En vivo = activa sin simulacro', () => {
    expect(camposDelModo('en_vivo')).toEqual({ automatizacion_activa: true, simulacro: false })
  })

  it('ida y vuelta: cada modo se traduce y vuelve igual', () => {
    for (const modo of ['apagado', 'prueba', 'en_vivo'] as ModoReel[]) {
      expect(modoDelReel(camposDelModo(modo))).toBe(modo)
    }
  })
})
