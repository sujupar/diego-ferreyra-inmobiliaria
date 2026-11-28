import { describe, it, expect } from 'vitest'
import {
  ZONA_AR,
  HORARIO_LABORAL,
  enArgentina,
  instanteDesdeAR,
  esDiaHabil,
  siguienteDiaHabil,
  diasDeCalendarioEntre,
  enHorarioOProximo,
} from './horario-laboral'

// Argentina es UTC−3 todo el año (sin horario de verano): 12:00 UTC = 09:00 AR.
// Calendario de referencia: 2026-11-25 es miércoles.

describe('constantes del horario laboral', () => {
  it('la zona es la de Buenos Aires', () => {
    expect(ZONA_AR).toBe('America/Argentina/Buenos_Aires')
  })
  it('los días hábiles son de lunes a viernes, de 10 a 14 (el horario de la coordinación)', () => {
    expect(HORARIO_LABORAL.dias).toEqual([1, 2, 3, 4, 5])
    expect(HORARIO_LABORAL.inicio).toBe('10:00')
    expect(HORARIO_LABORAL.fin).toBe('14:00')
  })
})

describe('enArgentina', () => {
  it('pasa un instante UTC a fecha, hora y día de la semana de Argentina', () => {
    expect(enArgentina(new Date('2026-11-25T12:00:00Z'))).toEqual({
      fecha: '2026-11-25',
      hora: '09:00',
      diaSemana: 3,
    })
  })
  it('a la 1:30 UTC del miércoles todavía es martes 22:30 en Argentina', () => {
    expect(enArgentina(new Date('2026-11-25T01:30:00Z'))).toEqual({
      fecha: '2026-11-24',
      hora: '22:30',
      diaSemana: 2,
    })
  })
  it('la medianoche de Argentina se escribe 00:00, no 24:00', () => {
    expect(enArgentina(new Date('2026-11-25T03:00:00Z')).hora).toBe('00:00')
  })
})

describe('instanteDesdeAR', () => {
  it('las 9:00 de Argentina son las 12:00 UTC', () => {
    expect(instanteDesdeAR('2026-11-25', '09:00').toISOString()).toBe('2026-11-25T12:00:00.000Z')
  })
  it('ida y vuelta con enArgentina da lo mismo', () => {
    const instante = instanteDesdeAR('2026-12-31', '23:45')
    expect(enArgentina(instante)).toMatchObject({ fecha: '2026-12-31', hora: '23:45' })
  })
  it('ida y vuelta desde un instante cualquiera, sin segundos', () => {
    const original = new Date('2026-03-01T17:07:00Z')
    const ar = enArgentina(original)
    expect(instanteDesdeAR(ar.fecha, ar.hora).getTime()).toBe(original.getTime())
  })
  it('una fecha con formato inválido tira error', () => {
    expect(() => instanteDesdeAR('25/11/2026', '09:00')).toThrow()
  })
  it('una hora con formato inválido tira error', () => {
    expect(() => instanteDesdeAR('2026-11-25', '9')).toThrow()
  })
  it('una hora fuera de rango tira error', () => {
    expect(() => instanteDesdeAR('2026-11-25', '24:00')).toThrow()
  })
  it('una fecha que no existe en el calendario tira error', () => {
    expect(() => instanteDesdeAR('2026-02-30', '09:00')).toThrow()
  })
  it('vacío tira error', () => {
    expect(() => instanteDesdeAR('', '')).toThrow()
  })
})

describe('esDiaHabil', () => {
  it('el miércoles es hábil', () => {
    expect(esDiaHabil('2026-11-25')).toBe(true)
  })
  it('el sábado no es hábil', () => {
    expect(esDiaHabil('2026-11-28')).toBe(false)
  })
  it('el domingo no es hábil', () => {
    expect(esDiaHabil('2026-11-29')).toBe(false)
  })
  it('una fecha inválida tira error', () => {
    expect(() => esDiaHabil('2026-13-01')).toThrow()
  })
})

describe('siguienteDiaHabil', () => {
  it('el viernes pasa al lunes', () => {
    expect(siguienteDiaHabil(new Date('2026-11-27T15:00:00Z'))).toEqual({ fecha: '2026-11-30', hora: '10:00' })
  })
  it('el sábado pasa al lunes', () => {
    expect(siguienteDiaHabil(new Date('2026-11-28T15:00:00Z'))).toEqual({ fecha: '2026-11-30', hora: '10:00' })
  })
  it('el domingo pasa al lunes', () => {
    expect(siguienteDiaHabil(new Date('2026-11-29T15:00:00Z'))).toEqual({ fecha: '2026-11-30', hora: '10:00' })
  })
  it('el miércoles pasa al jueves', () => {
    expect(siguienteDiaHabil(new Date('2026-11-25T15:00:00Z'))).toEqual({ fecha: '2026-11-26', hora: '10:00' })
  })
  it('el martes a las 22:30 de Argentina (ya miércoles en UTC) pasa al miércoles', () => {
    expect(siguienteDiaHabil(new Date('2026-11-25T01:30:00Z'))).toEqual({ fecha: '2026-11-25', hora: '10:00' })
  })
  it('el 31 de diciembre pasa al año siguiente', () => {
    // 2026-12-31 es jueves → viernes 2027-01-01 (los feriados no se consideran)
    expect(siguienteDiaHabil(new Date('2026-12-31T15:00:00Z'))).toEqual({ fecha: '2027-01-01', hora: '10:00' })
  })
  it('el viernes 31 de diciembre de 2027 pasa al lunes 3 de enero de 2028', () => {
    expect(siguienteDiaHabil(new Date('2027-12-31T15:00:00Z'))).toEqual({ fecha: '2028-01-03', hora: '10:00' })
  })
})

describe('diasDeCalendarioEntre', () => {
  it('el mismo día da 0', () => {
    expect(diasDeCalendarioEntre(new Date('2026-11-25T12:00:00Z'), new Date('2026-11-25T20:00:00Z'))).toBe(0)
  })
  it('de las 23:30 a las 00:30 de Argentina cruza la medianoche y cuenta 1 día', () => {
    expect(
      diasDeCalendarioEntre(new Date('2026-11-26T02:30:00Z'), new Date('2026-11-26T03:30:00Z')),
    ).toBe(1)
  })
  it('de las 22:00 a las 23:30 de Argentina es el mismo día aunque en UTC cambie', () => {
    expect(
      diasDeCalendarioEntre(new Date('2026-11-26T01:00:00Z'), new Date('2026-11-26T02:30:00Z')),
    ).toBe(0)
  })
  it('tres días de calendario', () => {
    expect(diasDeCalendarioEntre(new Date('2026-11-22T20:00:00Z'), new Date('2026-11-25T12:00:00Z'))).toBe(3)
  })
  it('cruza el fin de año', () => {
    expect(diasDeCalendarioEntre(new Date('2026-12-30T15:00:00Z'), new Date('2027-01-02T15:00:00Z'))).toBe(3)
  })
  it('hacia atrás da negativo', () => {
    expect(diasDeCalendarioEntre(new Date('2026-11-25T15:00:00Z'), new Date('2026-11-23T15:00:00Z'))).toBe(-2)
  })
})

describe('enHorarioOProximo (crm-cadencia-paula, D2)', () => {
  const ar = (f: string, h: string) => new Date(`${f}T${h}:00-03:00`)
  it('en horario: ese momento', () => {
    expect(enHorarioOProximo(ar('2026-11-24', '10:00'))).toEqual({ fecha: '2026-11-24', hora: '10:00' })
    expect(enHorarioOProximo(ar('2026-11-24', '13:59'))).toEqual({ fecha: '2026-11-24', hora: '13:59' })
  })
  it('antes de las 10 de un día hábil: ese día a las 10', () => {
    expect(enHorarioOProximo(ar('2026-11-24', '07:30'))).toEqual({ fecha: '2026-11-24', hora: '10:00' })
  })
  it('desde las 14 o fin de semana: el día hábil siguiente a las 10', () => {
    expect(enHorarioOProximo(ar('2026-11-24', '14:00'))).toEqual({ fecha: '2026-11-25', hora: '10:00' })
    expect(enHorarioOProximo(ar('2026-11-28', '11:00'))).toEqual({ fecha: '2026-11-30', hora: '10:00' })
  })
})
