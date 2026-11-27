import { describe, it, expect } from 'vitest'
import { contarTramos, segundosVistos, porcentajeVisto, loTermino, formatoMinutos } from './tramos'

const tramos = (n: number, desde = 0) => '0'.repeat(desde) + '1'.repeat(n) + '0'.repeat(100 - n - desde)

describe('minutos vistos desde los tramos (no desde la posición más lejana)', () => {
  it('cuenta los tramos encendidos', () => {
    expect(contarTramos(tramos(63))).toBe(63)
    expect(contarTramos(null)).toBe(0)
    expect(contarTramos('')).toBe(0)
  })

  it('segundos = tramos × duración / 100', () => {
    expect(segundosVistos(tramos(63), 810)).toBeCloseTo(510.3)
    expect(segundosVistos(tramos(50), null)).toBe(0)
  })

  it('adelantar al final no infla: un minuto visto + salto al final sigue siendo ~1 minuto', () => {
    const unMinutoMasElFinal = tramos(8) .slice(0, 99) + '1'
    expect(porcentajeVisto(unMinutoMasElFinal)).toBe(9)
    expect(loTermino(unMinutoMasElFinal)).toBe(false)
  })

  it('lo terminó con 95 tramos o más', () => {
    expect(loTermino(tramos(95))).toBe(true)
    expect(loTermino(tramos(94))).toBe(false)
  })

  it('formatea mm:ss', () => {
    expect(formatoMinutos(510)).toBe('8:30')
    expect(formatoMinutos(810)).toBe('13:30')
    expect(formatoMinutos(5.6)).toBe('0:05')
    expect(formatoMinutos(0)).toBe('0:00')
  })
})
