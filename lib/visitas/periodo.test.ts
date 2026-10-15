import { describe, it, expect } from 'vitest'
import { resolverPeriodo, validarRango, esFechaValida, esClavePeriodo } from './periodo'
import { fechaEnArgentina } from './horario'

const HOY = '2026-10-15'

function periodo(entrada: Parameters<typeof resolverPeriodo>[0], hoy = HOY) {
  const r = resolverPeriodo(entrada, hoy)
  if (!r.ok) throw new Error(r.error)
  return r.periodo
}

describe('resolverPeriodo', () => {
  it('sin nada: últimos 30 días contando hoy', () => {
    expect(periodo({})).toEqual({ clave: '30d', desde: '2026-09-16', hasta: '2026-10-15', etiqueta: 'Últimos 30 días' })
  })
  it('7 días: de hoy-6 a hoy', () => {
    expect(periodo({ periodo: '7d' })).toMatchObject({ clave: '7d', desde: '2026-10-09', hasta: '2026-10-15', etiqueta: 'Últimos 7 días' })
  })
  it('este mes: del 1 al ÚLTIMO día del mes (incluye los días que vienen)', () => {
    expect(periodo({ periodo: 'mes' })).toMatchObject({ clave: 'mes', desde: '2026-10-01', hasta: '2026-10-31', etiqueta: 'Este mes' })
    expect(periodo({ periodo: 'mes' }, '2028-02-10')).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(periodo({ periodo: 'mes' }, '2026-12-31')).toMatchObject({ desde: '2026-12-01', hasta: '2026-12-31' })
  })
  it('un período desconocido o "personalizado" sin fechas cae en 30 días', () => {
    expect(periodo({ periodo: 'inventado' }).clave).toBe('30d')
    expect(periodo({ periodo: 'personalizado' }).clave).toBe('30d')
  })
  it('con from y to manda el rango (así llega el link de Inicio: ?from=hoy&to=hoy)', () => {
    expect(periodo({ periodo: '7d', from: HOY, to: HOY })).toEqual({ clave: 'personalizado', desde: HOY, hasta: HOY, etiqueta: 'Hoy' })
    expect(periodo({ from: '2026-10-01', to: '2026-10-10' }).etiqueta).toBe('Del 01/10 al 10/10')
    expect(periodo({ from: '2026-10-03', to: '2026-10-03' }).etiqueta).toBe('El 03/10')
  })
  it('rango inválido: mensaje claro', () => {
    expect(resolverPeriodo({ from: '2026-10-10', to: '2026-10-01' }, HOY)).toEqual({ ok: false, error: 'La fecha "desde" es posterior a "hasta"' })
    expect(resolverPeriodo({ from: '2026-02-31', to: '2026-03-01' }, HOY)).toEqual({ ok: false, error: 'Elegí las dos fechas del período' })
    expect(resolverPeriodo({ from: '2026-10-01' }, HOY)).toEqual({ ok: false, error: 'Elegí las dos fechas del período' })
    expect(resolverPeriodo({ from: '2024-01-01', to: '2026-10-01' }, HOY)).toEqual({ ok: false, error: 'Elegí un período de hasta un año' })
  })
  it('a las 23:30 de Argentina "hoy" sigue siendo el mismo día (en UTC ya es mañana)', () => {
    const hoy = fechaEnArgentina(new Date('2026-11-01T02:30:00Z'))
    expect(hoy).toBe('2026-10-31')
    expect(periodo({ periodo: 'mes' }, hoy)).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' })
  })
})

describe('validaciones sueltas', () => {
  it('esFechaValida rechaza fechas que no existen y formatos raros', () => {
    expect(esFechaValida('2026-10-15')).toBe(true)
    expect(esFechaValida('2026-02-29')).toBe(false)
    expect(esFechaValida('15/10/2026')).toBe(false)
    expect(esFechaValida('')).toBe(false)
    expect(esFechaValida(null)).toBe(false)
  })
  it('validarRango: 366 días entran, 367 no', () => {
    expect(validarRango('2025-10-15', '2026-10-15')).toBeNull()
    expect(validarRango('2025-10-14', '2026-10-15')).toBe('Elegí un período de hasta un año')
  })
  it('esClavePeriodo', () => {
    expect(esClavePeriodo('mes')).toBe(true)
    expect(esClavePeriodo('año')).toBe(false)
  })
})
