import { describe, expect, it } from 'vitest'
import { labelDia, labelSemana, mondayOf } from './fechas'

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
