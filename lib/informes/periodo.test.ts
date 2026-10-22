import { describe, it, expect } from 'vitest'
import { quincenaQueCerro, cicloDeLaPropiedad, recortarALaCaptacion, validarRango, diasDelPeriodo, textoDelPeriodo } from './periodo'

describe('quincenaQueCerro (el ciclo fijo: se corre el 1 y el 16)', () => {
  it('el 16 cierra la primera quincena del mes: del 1 al 15', () => {
    expect(quincenaQueCerro('2026-10-16')).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' })
  })
  it('el 1 cierra la segunda quincena del mes anterior: del 16 al último día', () => {
    expect(quincenaQueCerro('2026-11-01')).toEqual({ desde: '2026-10-16', hasta: '2026-10-31' })
    expect(quincenaQueCerro('2026-10-01')).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' })
  })
  it('febrero (28 y bisiesto) y el cambio de año', () => {
    expect(quincenaQueCerro('2026-03-01')).toEqual({ desde: '2026-02-16', hasta: '2026-02-28' })
    expect(quincenaQueCerro('2028-03-01')).toEqual({ desde: '2028-02-16', hasta: '2028-02-29' })
    expect(quincenaQueCerro('2027-01-01')).toEqual({ desde: '2026-12-16', hasta: '2026-12-31' })
  })
  it('cualquier otro día devuelve la última quincena cerrada (sirve de atajo "Última quincena")', () => {
    expect(quincenaQueCerro('2026-10-22')).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' })
    expect(quincenaQueCerro('2026-10-09')).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' })
  })
})

describe('cicloDeLaPropiedad (bloques de 15 días desde la captación)', () => {
  it('el último bloque completo: captada el 1/9, el 22/10 → 16/10 al 30/10 todavía no cerró, va 1/10 a 15/10', () => {
    expect(cicloDeLaPropiedad('2026-09-01', '2026-10-22')).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' })
  })
  it('justo al cerrar un bloque', () => {
    expect(cicloDeLaPropiedad('2026-10-01', '2026-10-16')).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' })
  })
  it('sin un bloque completo todavía → null', () => {
    expect(cicloDeLaPropiedad('2026-10-10', '2026-10-22')).toBeNull()
    expect(cicloDeLaPropiedad('2026-10-30', '2026-10-22')).toBeNull()
  })
})

describe('recortarALaCaptacion (una propiedad captada a mitad de quincena)', () => {
  const q = { desde: '2026-10-01', hasta: '2026-10-15' }
  it('captada antes: el período entero', () => {
    expect(recortarALaCaptacion(q, '2026-09-20')).toEqual(q)
  })
  it('captada en el medio: arranca el día de la captación', () => {
    expect(recortarALaCaptacion(q, '2026-10-08')).toEqual({ desde: '2026-10-08', hasta: '2026-10-15' })
  })
  it('captada después: no corresponde informe', () => {
    expect(recortarALaCaptacion(q, '2026-10-20')).toBeNull()
  })
  it('sin fecha de captación: el período entero', () => {
    expect(recortarALaCaptacion(q, null)).toEqual(q)
  })
})

describe('validarRango (fechas libres del "Nuevo informe")', () => {
  const HOY = '2026-10-22'
  it('un rango normal pasa', () => {
    expect(validarRango('2026-10-01', '2026-10-15', HOY)).toEqual({ ok: true, desde: '2026-10-01', hasta: '2026-10-15' })
  })
  it('un solo día pasa', () => {
    expect(validarRango('2026-10-10', '2026-10-10', HOY).ok).toBe(true)
  })
  it('rechaza formato inválido y fechas que no existen', () => {
    expect(validarRango('01/10/2026', '2026-10-15', HOY).ok).toBe(false)
    expect(validarRango('2026-02-30', '2026-03-05', HOY).ok).toBe(false)
  })
  it('rechaza hasta antes de desde, el futuro y más de 120 días', () => {
    expect(validarRango('2026-10-15', '2026-10-01', HOY)).toEqual({ ok: false, error: 'La fecha final tiene que ser posterior a la inicial' })
    expect(validarRango('2026-10-15', '2026-10-30', HOY)).toEqual({ ok: false, error: 'El informe no puede terminar en el futuro' })
    expect(validarRango('2026-01-01', '2026-10-15', HOY)).toEqual({ ok: false, error: 'El período no puede pasar de 120 días' })
  })
})

describe('diasDelPeriodo', () => {
  it('cuenta los dos extremos', () => {
    expect(diasDelPeriodo({ desde: '2026-10-01', hasta: '2026-10-15' })).toBe(15)
    expect(diasDelPeriodo({ desde: '2026-10-10', hasta: '2026-10-10' })).toBe(1)
  })
})

describe('textoDelPeriodo', () => {
  it('mismo mes', () => {
    expect(textoDelPeriodo('2026-10-01', '2026-10-15')).toBe('del 1 al 15 de octubre de 2026')
  })
  it('meses distintos del mismo año', () => {
    expect(textoDelPeriodo('2026-08-16', '2026-09-16')).toBe('del 16 de agosto al 16 de septiembre de 2026')
  })
  it('cruza el año', () => {
    expect(textoDelPeriodo('2026-12-16', '2027-01-15')).toBe('del 16 de diciembre de 2026 al 15 de enero de 2027')
  })
})
