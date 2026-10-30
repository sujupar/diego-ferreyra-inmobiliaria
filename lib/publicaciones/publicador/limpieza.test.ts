import { describe, expect, it } from 'vitest'
import { listoParaBorrar } from './limpieza'

const AHORA = new Date('2026-12-15T12:00:00Z')
const viejo = '2026-11-01T00:00:00Z'
const reciente = '2026-12-01T00:00:00Z'

describe('listoParaBorrar', () => {
  it('se borra si todas sus redes terminaron hace más de 30 días', () => {
    expect(listoParaBorrar([{ estado: 'publicado', updated_at: viejo }, { estado: 'cancelado', updated_at: viejo }], AHORA)).toBe(true)
  })

  it('no se borra si alguna red terminó hace menos de 30 días', () => {
    expect(listoParaBorrar([{ estado: 'publicado', updated_at: viejo }, { estado: 'publicado', updated_at: reciente }], AHORA)).toBe(false)
  })

  it('no se borra si alguna red falló (todavía se puede reintentar) o sigue pendiente', () => {
    expect(listoParaBorrar([{ estado: 'publicado', updated_at: viejo }, { estado: 'fallido', updated_at: viejo }], AHORA)).toBe(false)
    expect(listoParaBorrar([{ estado: 'programado', updated_at: viejo }], AHORA)).toBe(false)
  })

  it('sin envíos no se borra (no es un video programado)', () => {
    expect(listoParaBorrar([], AHORA)).toBe(false)
  })

  it('si todo se canceló no hay nada que esperar, pero igual se respetan los 30 días', () => {
    expect(listoParaBorrar([{ estado: 'cancelado', updated_at: reciente }], AHORA)).toBe(false)
  })
})
