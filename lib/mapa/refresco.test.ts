import { describe, it, expect } from 'vitest'
import { elegirCeldaParaActualizar } from './refresco'

const ahora = new Date('2026-10-20T12:00:00Z')
const hace = (dias: number, horas = 0) => new Date(ahora.getTime() - dias * 86_400_000 - horas * 3_600_000).toISOString()

describe('elegirCeldaParaActualizar', () => {
  it('primero las que nunca bajaron bien', () => {
    expect(elegirCeldaParaActualizar([
      { id: 'vieja', estado: 'ok', actualizado_en: hace(40), intentado_en: hace(40) },
      { id: 'nunca', estado: 'pendiente', actualizado_en: null, intentado_en: null },
    ], ahora)).toBe('nunca')
  })

  it('después la más vieja con más de 30 días', () => {
    expect(elegirCeldaParaActualizar([
      { id: 'a', estado: 'ok', actualizado_en: hace(35), intentado_en: hace(35) },
      { id: 'b', estado: 'ok', actualizado_en: hace(50), intentado_en: hace(50) },
      { id: 'c', estado: 'ok', actualizado_en: hace(10), intentado_en: hace(10) },
    ], ahora)).toBe('b')
  })

  it('con todas al día no hay nada que hacer', () => {
    expect(elegirCeldaParaActualizar([{ id: 'a', estado: 'ok', actualizado_en: hace(5), intentado_en: hace(5) }], ahora)).toBeNull()
  })

  it('una que falló hace menos de 1 hora espera (no se insiste contra un servidor caído)', () => {
    expect(elegirCeldaParaActualizar([
      { id: 'recien', estado: 'error', actualizado_en: hace(40), intentado_en: hace(0, 0.5) },
      { id: 'otra', estado: 'ok', actualizado_en: hace(31), intentado_en: hace(31) },
    ], ahora)).toBe('otra')
    expect(elegirCeldaParaActualizar([
      { id: 'recien', estado: 'error', actualizado_en: hace(40), intentado_en: hace(0, 2) },
    ], ahora)).toBe('recien')
  })
})
