import { describe, expect, it } from 'vitest'
import { diaCorto, fechaExacta, fechaRelativa, horaCorta, textoVencimiento, cuandoEs } from './formato-fecha'

// Argentina es UTC−3: las 13:00 UTC son las 10:00 de Argentina.
const ahora = new Date('2026-11-25T13:00:00Z') // miércoles 25 nov, 10:00 AR

describe('horaCorta', () => {
  it('saca el cero de adelante de la hora', () => {
    expect(horaCorta('09:00')).toBe('9:00')
    expect(horaCorta('16:30:00')).toBe('16:30')
  })
})

describe('diaCorto', () => {
  it('día de la semana, día y mes en castellano', () => {
    expect(diaCorto('2026-11-30')).toBe('lun 30 nov')
    expect(diaCorto('2026-11-25')).toBe('mié 25 nov')
  })
})

describe('fechaRelativa (pasado)', () => {
  it('menos de un minuto es "recién"', () => {
    expect(fechaRelativa('2026-11-25T12:59:40Z', ahora)).toBe('recién')
  })
  it('minutos y horas del mismo día', () => {
    expect(fechaRelativa('2026-11-25T12:48:00Z', ahora)).toBe('hace 12 min')
    expect(fechaRelativa('2026-11-25T11:00:00Z', ahora)).toBe('hace 2 h')
  })
  it('ayer y hace N días, contados en días de Argentina', () => {
    expect(fechaRelativa('2026-11-24T13:15:00Z', ahora)).toBe('ayer')
    expect(fechaRelativa('2026-11-22T13:00:00Z', ahora)).toBe('hace 3 días')
  })
  it('las 23:30 de Argentina vistas a las 00:30 del día siguiente son "ayer"', () => {
    expect(fechaRelativa('2026-11-25T02:30:00Z', new Date('2026-11-25T03:30:00Z'))).toBe('ayer')
  })
  it('una semana o más muestra el día y el mes', () => {
    expect(fechaRelativa('2026-11-12T13:00:00Z', ahora)).toBe('12 nov')
  })
  it('un instante ilegible no rompe la lista', () => {
    expect(fechaRelativa('no-es-fecha', ahora)).toBe('')
  })
})

describe('fechaRelativa (futuro) y cuandoEs', () => {
  it('hoy, mañana y otro día con la hora', () => {
    expect(fechaRelativa('2026-11-25T19:00:00Z', ahora)).toBe('hoy 16:00')
    expect(fechaRelativa('2026-11-26T12:00:00Z', ahora)).toBe('mañana 9:00')
    expect(fechaRelativa('2026-11-30T12:00:00Z', ahora)).toBe('lun 30 nov, 9:00')
  })
  it('cuandoEs arma lo mismo desde una fecha y una hora de Argentina', () => {
    expect(cuandoEs('2026-11-26', '09:00:00', ahora)).toBe('mañana 9:00')
    expect(cuandoEs('2026-11-30', '09:00', ahora)).toBe('lun 30 nov, 9:00')
  })
  it('un viernes, la tarea del lunes no dice "mañana"', () => {
    const viernes = new Date('2026-11-27T13:00:00Z')
    expect(cuandoEs('2026-11-30', '09:00', viernes)).toBe('lun 30 nov, 9:00')
  })
})

describe('fechaExacta', () => {
  it('día, año y hora de Argentina', () => {
    expect(fechaExacta('2026-11-24T13:15:00Z')).toBe('mar 24 nov 2026, 10:15')
  })
  it('vacía si la fecha no se entiende', () => {
    expect(fechaExacta('x')).toBe('')
  })
})

describe('textoVencimiento', () => {
  it('sin fecha', () => {
    expect(textoVencimiento({ due_date: null, due_time: null }, ahora)).toEqual({ texto: 'Sin fecha', estado: 'sinfecha' })
  })
  it('vencida hace 2 días (no 3) a las 22:00 de Argentina, y la de mañana a las 9:00 no está vencida', () => {
    const noche = new Date('2026-11-26T01:00:00Z') // 25 nov 22:00 AR (ya es 26 en UTC)
    expect(textoVencimiento({ due_date: '2026-11-23', due_time: null }, noche)).toEqual({
      texto: 'Vencida hace 2 días',
      estado: 'vencida',
    })
    expect(textoVencimiento({ due_date: '2026-11-26', due_time: '09:00:00' }, noche)).toEqual({
      texto: 'Mañana 9:00',
      estado: 'proxima',
    })
  })
  it('vencida hace 1 día en singular', () => {
    expect(textoVencimiento({ due_date: '2026-11-24', due_time: null }, ahora).texto).toBe('Vencida hace 1 día')
  })
  it('hoy, con hora que ya pasó, dice hace cuánto', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '09:00' }, ahora)).toEqual({
      texto: 'Vencida hace 1 h',
      estado: 'vencida',
    })
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '09:45' }, ahora).texto).toBe('Vencida hace 15 min')
  })
  it('hoy todavía no vencida', () => {
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: '16:00' }, ahora)).toEqual({ texto: 'Hoy 16:00', estado: 'hoy' })
    expect(textoVencimiento({ due_date: '2026-11-25', due_time: null }, ahora)).toEqual({ texto: 'Hoy', estado: 'hoy' })
  })
  it('mañana sin hora y otro día', () => {
    expect(textoVencimiento({ due_date: '2026-11-26', due_time: null }, ahora).texto).toBe('Mañana')
    expect(textoVencimiento({ due_date: '2026-11-30', due_time: '09:00' }, ahora).texto).toBe('lun 30 nov, 9:00')
  })
})
