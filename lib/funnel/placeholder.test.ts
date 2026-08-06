import { describe, it, expect } from 'vitest'
import { isPlaceholderAddress, buildPlaceholderAddress, FUNNEL_PLACEHOLDER_LABEL } from './placeholder'

describe('isPlaceholderAddress', () => {
  it('detecta el placeholder de tasación', () => {
    expect(isPlaceholderAddress('Solicitud de tasación — Juan Pérez')).toBe(true)
  })

  it('detecta el placeholder de clase gratuita', () => {
    expect(isPlaceholderAddress('Clase Gratuita — María López')).toBe(true)
  })

  it('una dirección real NO matchea (aunque el nombre del lead contenga palabras parecidas)', () => {
    expect(isPlaceholderAddress('Av. Cabildo 2000')).toBe(false)
    expect(isPlaceholderAddress('Solicitud 2000, Villa Devoto')).toBe(false) // no arranca con el label completo
  })

  it('el label solo (sin separador ni nombre) NO matchea — no es el formato real que arma createFunnelLead', () => {
    expect(isPlaceholderAddress('Solicitud de tasación')).toBe(false)
    expect(isPlaceholderAddress('Clase Gratuita')).toBe(false)
  })

  it('null/undefined/vacío → false', () => {
    expect(isPlaceholderAddress(null)).toBe(false)
    expect(isPlaceholderAddress(undefined)).toBe(false)
    expect(isPlaceholderAddress('')).toBe(false)
  })

  it('es consistente con lo que arma buildPlaceholderAddress (misma fuente: FUNNEL_PLACEHOLDER_LABEL)', () => {
    expect(isPlaceholderAddress(buildPlaceholderAddress('tasacion', 'Juan Pérez'))).toBe(true)
    expect(isPlaceholderAddress(buildPlaceholderAddress('clase', 'Juan Pérez'))).toBe(true)
  })
})

describe('buildPlaceholderAddress', () => {
  it('arma "{label} — {nombre}" para cada funnel', () => {
    expect(buildPlaceholderAddress('tasacion', 'Juan Pérez')).toBe('Solicitud de tasación — Juan Pérez')
    expect(buildPlaceholderAddress('clase', 'Juan Pérez')).toBe('Clase Gratuita — Juan Pérez')
  })

  it('usa los mismos labels que expone FUNNEL_PLACEHOLDER_LABEL', () => {
    expect(buildPlaceholderAddress('tasacion', 'X')).toContain(FUNNEL_PLACEHOLDER_LABEL.tasacion)
    expect(buildPlaceholderAddress('clase', 'X')).toContain(FUNNEL_PLACEHOLDER_LABEL.clase)
  })
})
