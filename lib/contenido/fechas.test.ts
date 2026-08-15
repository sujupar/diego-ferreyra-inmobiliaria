import { describe, expect, it } from 'vitest'
import { addMonths, labelDia, labelSemana, mondayOf, monthGrid } from './fechas'

describe('mondayOf', () => {
  it('un lunes es su propio lunes', () => {
    expect(mondayOf('2026-08-17')).toBe('2026-08-17')
  })
  it('el viernes pertenece al lunes de su semana', () => {
    expect(mondayOf('2026-08-21')).toBe('2026-08-17')
  })
  it('el domingo pertenece al lunes ANTERIOR (semana ISO), no al siguiente', () => {
    expect(mondayOf('2026-08-23')).toBe('2026-08-17')
  })
  it('cruza el mes hacia atrás sin romperse', () => {
    // martes 1 de septiembre de 2026 → lunes 31 de agosto
    expect(mondayOf('2026-09-01')).toBe('2026-08-31')
  })
})

describe('labelSemana', () => {
  it('mismo mes', () => {
    expect(labelSemana('2026-08-17')).toBe('Semana del 17 al 21 de agosto')
  })
  it('cruce de mes', () => {
    expect(labelSemana('2026-08-31')).toBe('Semana del 31/8 al 4/9')
  })
})

describe('labelDia', () => {
  it('día y fecha cortos', () => {
    expect(labelDia('2026-08-18')).toBe('mar 18/8')
    expect(labelDia('2026-08-17')).toBe('lun 17/8')
  })
})

describe('monthGrid', () => {
  it('agosto 2026: arranca el lunes 27/7, termina el domingo 6/9, 6 semanas', () => {
    const g = monthGrid('2026-08')
    expect(g.length).toBe(6)
    expect(g[0][0]).toBe('2026-07-27')
    expect(g[5][6]).toBe('2026-09-06')
    expect(g.every((w) => w.length === 7)).toBe(true)
  })
  it('febrero 2027 (28 días que arrancan lunes): exactamente 4 semanas', () => {
    const g = monthGrid('2027-02')
    expect(g.length).toBe(4)
    expect(g[0][0]).toBe('2027-02-01')
    expect(g[3][6]).toBe('2027-02-28')
  })
})

describe('addMonths', () => {
  it('avanza y cruza el año', () => {
    expect(addMonths('2026-08', 1)).toBe('2026-09')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
})
