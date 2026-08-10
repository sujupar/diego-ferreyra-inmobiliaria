import { describe, it, expect } from 'vitest'
import { formatDateSeparator, dayKey, groupByDay } from './format'

/**
 * El separador de día del hilo. Es el único lugar donde se lee la fecha desde
 * que la burbuja muestra solo la hora, así que "hoy" y "ayer" —las dos fechas
 * que el asesor consulta cien veces por día— no pueden salir como número.
 */
describe('formatDateSeparator — Hoy / Ayer / la fecha', () => {
  // Mediodía a propósito: cualquier hora del mismo día tiene que dar lo mismo,
  // y a las 00:30 o a las 23:30 un cálculo hecho con restas de milisegundos se
  // equivoca de día.
  const ahora = new Date(2026, 7, 10, 12, 0, 0).getTime() // 10 de agosto de 2026

  function enEseDia(y: number, m: number, d: number, hora = 9): string {
    return new Date(y, m, d, hora, 0, 0).toISOString()
  }

  it('el mismo día dice "Hoy"', () => {
    expect(formatDateSeparator(enEseDia(2026, 7, 10), ahora)).toBe('Hoy')
  })

  it('"Hoy" vale a cualquier hora del día, no solo cerca del mediodía', () => {
    expect(formatDateSeparator(enEseDia(2026, 7, 10, 0), ahora)).toBe('Hoy')
    expect(formatDateSeparator(enEseDia(2026, 7, 10, 23), ahora)).toBe('Hoy')
  })

  it('el día anterior dice "Ayer"', () => {
    expect(formatDateSeparator(enEseDia(2026, 7, 9), ahora)).toBe('Ayer')
  })

  it('de dos días para atrás vuelve la fecha completa', () => {
    expect(formatDateSeparator(enEseDia(2026, 7, 8), ahora)).toBe('8 de agosto de 2026')
  })

  it('"Ayer" cruza el cambio de mes (1 de agosto → ayer es 31 de julio)', () => {
    // Restar 24hs a mano funciona acá de casualidad; restar un día de
    // calendario funciona siempre. El test fija el comportamiento correcto.
    const primeroDeAgosto = new Date(2026, 7, 1, 12, 0, 0).getTime()
    expect(formatDateSeparator(enEseDia(2026, 6, 31), primeroDeAgosto)).toBe('Ayer')
    expect(formatDateSeparator(enEseDia(2026, 6, 30), primeroDeAgosto)).toBe('30 de julio de 2026')
  })

  it('"Ayer" cruza el cambio de año', () => {
    const primeroDeEnero = new Date(2027, 0, 1, 12, 0, 0).getTime()
    expect(formatDateSeparator(enEseDia(2026, 11, 31), primeroDeEnero)).toBe('Ayer')
  })

  it('una fecha futura (reloj del teléfono adelantado) NO dice "Hoy"', () => {
    expect(formatDateSeparator(enEseDia(2026, 7, 11), ahora)).toBe('11 de agosto de 2026')
  })
})

describe('dayKey / groupByDay — un separador por día, no uno por mensaje', () => {
  it('dos mensajes del mismo día comparten separador', () => {
    const a = new Date(2026, 7, 10, 9).toISOString()
    const b = new Date(2026, 7, 10, 18).toISOString()
    expect(dayKey(a)).toBe(dayKey(b))
    const grupos = groupByDay([{ created_at: a }, { created_at: b }])
    expect(grupos.map(g => g.showSeparator)).toEqual([true, false])
  })

  it('al cambiar de día vuelve a aparecer', () => {
    const a = new Date(2026, 7, 9, 23).toISOString()
    const b = new Date(2026, 7, 10, 1).toISOString()
    const grupos = groupByDay([{ created_at: a }, { created_at: b }])
    expect(grupos.map(g => g.showSeparator)).toEqual([true, true])
  })
})
