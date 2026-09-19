import { describe, it, expect } from 'vitest'
import { AMBA, TAMANO_CELDA, todasLasCeldas, celdaDe, celdasCubriendo, dentroDelAmba } from './celdas'

describe('grilla del AMBA', () => {
  it('cubre el AMBA con 418 celdas de 0,05° sin repetir', () => {
    const celdas = todasLasCeldas()
    expect(TAMANO_CELDA).toBe(0.05)
    expect(celdas).toHaveLength(19 * 22)
    expect(new Set(celdas.map(c => c.id)).size).toBe(celdas.length)
    expect(celdas[0]).toEqual({ id: '-35.250_-59.200', sur: -35.25, oeste: -59.2, norte: -35.2, este: -59.15 })
  })

  it('ubica un punto real en su celda (Perón 4227)', () => {
    const c = celdaDe(-34.6058567, -58.4265171)
    expect(c?.id).toBe('-34.650_-58.450')
    expect(c!.sur).toBeLessThanOrEqual(-34.6058567)
    expect(c!.norte).toBeGreaterThan(-34.6058567)
  })

  it('un punto fuera del AMBA no tiene celda', () => {
    expect(celdaDe(-31.42, -64.18)).toBeNull() // Córdoba
    expect(dentroDelAmba(-31.42, -64.18)).toBe(false)
    expect(dentroDelAmba(AMBA.sur, AMBA.oeste)).toBe(true)
  })

  it('el radio de búsqueda en el medio de una celda usa solo esa celda', () => {
    expect(celdasCubriendo(-34.625, -58.425, 1500)).toEqual({ ids: ['-34.650_-58.450'], completo: true })
  })

  it('cerca de una esquina usa las cuatro celdas vecinas', () => {
    const r = celdasCubriendo(-34.6001, -58.4001, 1500)
    expect(r.completo).toBe(true)
    expect([...r.ids].sort()).toEqual(['-34.650_-58.450', '-34.650_-58.400', '-34.600_-58.450', '-34.600_-58.400'].sort())
  })

  it('en el borde del AMBA la cobertura queda incompleta (se consulta en vivo)', () => {
    expect(celdasCubriendo(AMBA.norte - 0.001, -58.5, 1500).completo).toBe(false)
  })
})
