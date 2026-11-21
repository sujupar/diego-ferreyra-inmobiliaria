import { describe, expect, it } from 'vitest'
import { elegirMejorMes, mesesCerradosDelAnio, tramoEnMes, type CandidatoMes } from './comparacion'

describe('tramoEnMes: los mismos días en otro mes', () => {
  it('del 1 al 20 de noviembre contra enero da del 1 al 20 de enero', () => {
    expect(tramoEnMes({ desde: '2026-11-01', hasta: '2026-11-20' }, '2026-01')).toEqual({ desde: '2026-01-01', hasta: '2026-01-20' })
  })
  it('un mes cerrado se compara contra el mes elegido entero', () => {
    expect(tramoEnMes({ desde: '2026-10-01', hasta: '2026-10-31' }, '2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(tramoEnMes({ desde: '2026-02-01', hasta: '2026-02-28' }, '2026-01')).toEqual({ desde: '2026-01-01', hasta: '2026-01-31' })
  })
  it('un día que no existe en el mes elegido cae en el último día', () => {
    expect(tramoEnMes({ desde: '2026-03-30', hasta: '2026-03-30' }, '2026-02')).toEqual({ desde: '2026-02-28', hasta: '2026-02-28' })
  })
  it('un período que cruza meses conserva su largo', () => {
    expect(tramoEnMes({ desde: '2026-10-25', hasta: '2026-11-05' }, '2026-03')).toEqual({ desde: '2026-03-25', hasta: '2026-04-05' })
  })
  it('un mes mal escrito no arma nada', () => {
    expect(tramoEnMes({ desde: '2026-11-01', hasta: '2026-11-20' }, '2026-13')).toBeNull()
    expect(tramoEnMes({ desde: '2026-11-01', hasta: '2026-11-20' }, 'enero')).toBeNull()
  })
})

describe('mesesCerradosDelAnio', () => {
  it('lista los meses del año anteriores al mes en curso', () => {
    expect(mesesCerradosDelAnio('2026-04-10')).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('en enero no hay meses cerrados', () => {
    expect(mesesCerradosDelAnio('2026-01-15')).toEqual([])
  })
})

const c = (mes: string, inversionUsd: number, solicitudes: number, diasConGasto = 30, diasDelMes = 30): CandidatoMes => ({ mes, inversionUsd, solicitudes, diasConGasto, diasDelMes })

describe('elegirMejorMes: el de menor costo por solicitud', () => {
  it('elige el mes con menor costo por solicitud', () => {
    expect(elegirMejorMes([c('2026-01', 269, 52), c('2026-02', 254, 29), c('2026-10', 259, 13)])).toBe('2026-01')
  })
  it('descarta un mes con pocos días de gasto (dato incompleto)', () => {
    expect(elegirMejorMes([c('2026-01', 50, 40, 5, 31), c('2026-02', 254, 29)])).toBe('2026-02')
  })
  it('descarta un mes sin solicitudes o sin inversión', () => {
    expect(elegirMejorMes([c('2026-01', 300, 0), c('2026-02', 0, 10), c('2026-03', 285, 26)])).toBe('2026-03')
  })
  it('ante un empate de costo gana el que tuvo más solicitudes', () => {
    expect(elegirMejorMes([c('2026-01', 100, 10), c('2026-02', 200, 20)])).toBe('2026-02')
  })
  it('sin candidatos válidos devuelve null', () => {
    expect(elegirMejorMes([])).toBeNull()
  })
})
