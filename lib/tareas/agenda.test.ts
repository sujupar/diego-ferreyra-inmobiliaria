import { describe, expect, it } from 'vitest'
import {
  enUnaHora,
  esperaDesde,
  estadoDeAviso,
  grupoDeTarea,
  mananaALas9,
  momentoDeAviso,
  resumenDeGrupos,
  tipoDeTarea,
  validarMomento,
  vencimientoDeEntrada,
} from './agenda'

// Argentina es UTC-3 todo el año.
const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`)
const t = (o: Partial<{ due_date: string | null; due_time: string | null; all_day: boolean | null; type: string; channel: string | null; deal_id: string | null; created_at: string }>) => ({
  due_date: null,
  due_time: null,
  all_day: true,
  type: 'follow_up',
  channel: null,
  deal_id: null,
  created_at: '2026-11-20T10:00:00Z',
  ...o,
})

describe('tipoDeTarea', () => {
  it('por canal', () => {
    expect(tipoDeTarea(t({ channel: 'call' }))).toBe('llamada')
    expect(tipoDeTarea(t({ channel: 'message' }))).toBe('mensaje')
    expect(tipoDeTarea(t({ channel: 'visit' }))).toBe('visita')
    expect(tipoDeTarea(t({ channel: 'document' }))).toBe('documentacion')
    expect(tipoDeTarea(t({ channel: 'other' }))).toBe('otro')
    expect(tipoDeTarea(t({ channel: 'email' }))).toBe('otro')
  })
  it('las del sistema, sin canal, por su clase', () => {
    expect(tipoDeTarea(t({ type: 'update_contact' }))).toBe('llamada')
    expect(tipoDeTarea(t({ type: 'new_assignment' }))).toBe('visita')
    for (const k of ['review_property', 'rejected_docs', 'complete_imported_property', 'informe_quincenal']) {
      expect(tipoDeTarea(t({ type: k }))).toBe('documentacion')
    }
    expect(tipoDeTarea(t({ type: 'follow_up' }))).toBe('otro')
    expect(tipoDeTarea(t({ type: 'algo_nuevo' }))).toBe('otro')
  })
})

describe('grupoDeTarea', () => {
  const ahora = ar('2026-11-24', '11:00')
  it('sin fecha', () => expect(grupoDeTarea(t({}), ahora)).toBe('sin_fecha'))
  it('con hora: vencida y hoy', () => {
    expect(grupoDeTarea(t({ due_date: '2026-11-24', due_time: '10:30:00', all_day: false }), ahora)).toBe('vencidas')
    expect(grupoDeTarea(t({ due_date: '2026-11-24', due_time: '15:00:00', all_day: false }), ahora)).toBe('hoy')
  })
  it('todo el día: hoy hasta que termina el día', () => {
    expect(grupoDeTarea(t({ due_date: '2026-11-24' }), ar('2026-11-24', '22:00'))).toBe('hoy')
    expect(grupoDeTarea(t({ due_date: '2026-11-24' }), ar('2026-11-25', '00:10'))).toBe('vencidas')
  })
  it('noche de Argentina: mañana sigue siendo próxima', () => {
    expect(grupoDeTarea(t({ due_date: '2026-11-25', due_time: '09:00:00', all_day: false }), ar('2026-11-24', '22:30'))).toBe('proximas')
  })
})

describe('avisos', () => {
  const corte = ar('2026-11-01', '00:00')
  it('momento de aviso: su hora, o las 9:00 si es de todo el día', () => {
    expect(momentoDeAviso(t({ due_date: '2026-11-24', due_time: '15:00:00', all_day: false }))?.toISOString()).toBe(ar('2026-11-24', '15:00').toISOString())
    expect(momentoDeAviso(t({ due_date: '2026-11-24' }))?.toISOString()).toBe(ar('2026-11-24', '09:00').toISOString())
    expect(momentoDeAviso(t({}))).toBeNull()
  })
  it('todo el día: suena desde las 9:00 en "Ahora", no antes', () => {
    expect(estadoDeAviso(t({ due_date: '2026-11-24' }), ar('2026-11-24', '08:30'), corte)).toBeNull()
    expect(estadoDeAviso(t({ due_date: '2026-11-24' }), ar('2026-11-24', '09:05'), corte)).toBe('ahora')
    expect(estadoDeAviso(t({ due_date: '2026-11-24' }), ar('2026-11-25', '09:05'), corte)).toBe('vencida')
  })
  it('con hora que pasó: vencida', () => {
    expect(estadoDeAviso(t({ due_date: '2026-11-24', due_time: '10:30:00', all_day: false }), ar('2026-11-24', '11:00'), corte)).toBe('vencida')
  })
  it('sin fecha nunca; antes del corte nunca', () => {
    expect(estadoDeAviso(t({}), ar('2026-11-24', '11:00'), corte)).toBeNull()
    expect(estadoDeAviso(t({ due_date: '2026-10-20' }), ar('2026-11-24', '11:00'), corte)).toBeNull()
  })
})

describe('posponer', () => {
  it('en 1 hora, redondeado hacia arriba de a 5 minutos', () => {
    expect(enUnaHora(ar('2026-11-24', '10:42'))).toEqual({ fecha: '2026-11-24', hora: '11:45' })
    expect(enUnaHora(ar('2026-11-24', '10:40'))).toEqual({ fecha: '2026-11-24', hora: '11:40' })
    expect(enUnaHora(ar('2026-11-24', '23:30'))).toEqual({ fecha: '2026-11-25', hora: '00:30' })
  })
  it('mañana a las 9:00: el día de calendario siguiente', () => {
    expect(mananaALas9(ar('2026-11-28', '20:00'))).toEqual({ fecha: '2026-11-29', hora: '09:00' })
  })
  it('validar momento', () => {
    const ahora = ar('2026-11-24', '11:00')
    expect(validarMomento('2026-11-24', '10:59', ahora)).toBe('Elegí un día y una hora que todavía no hayan pasado.')
    expect(validarMomento('2026-11-24', '11:05', ahora)).toBeNull()
    expect(validarMomento('2026-13-40', '11:05', ahora)).toBe('Elegí un día y una hora válidos.')
  })
})

describe('vencimientoDeEntrada', () => {
  it('en horario: el momento del registro', () => {
    expect(vencimientoDeEntrada(ar('2026-11-24', '15:10'))).toEqual({ fecha: '2026-11-24', hora: '15:10' })
  })
  it('después de hora o fin de semana: día hábil siguiente a las 9:00', () => {
    expect(vencimientoDeEntrada(ar('2026-11-27', '21:00'))).toEqual({ fecha: '2026-11-30', hora: '09:00' }) // viernes → lunes
    expect(vencimientoDeEntrada(ar('2026-11-28', '12:00'))).toEqual({ fecha: '2026-11-30', hora: '09:00' }) // sábado
  })
  it('antes de las 9 de un día hábil: ese mismo día a las 9:00', () => {
    expect(vencimientoDeEntrada(ar('2026-11-24', '07:30'))).toEqual({ fecha: '2026-11-24', hora: '09:00' })
  })
})

describe('esperaDesde', () => {
  it('la tarea de entrada que vence al crearse espera desde ese momento', () => {
    const x = t({ type: 'update_contact', deal_id: 'd1', due_date: '2026-11-24', due_time: '15:10:00', all_day: false, created_at: ar('2026-11-24', '15:11').toISOString() })
    expect(esperaDesde(x)).toBe(ar('2026-11-24', '15:10').toISOString())
  })
  it('si vence después (entró fuera de horario) no es espera', () => {
    const x = t({ type: 'update_contact', deal_id: 'd1', due_date: '2026-11-30', due_time: '09:00:00', all_day: false, created_at: ar('2026-11-27', '21:00').toISOString() })
    expect(esperaDesde(x)).toBeNull()
  })
  it('otra tarea, no', () => {
    expect(esperaDesde(t({ due_date: '2026-11-24', due_time: '15:10:00', created_at: ar('2026-11-24', '15:10').toISOString() }))).toBeNull()
  })
})

describe('resumenDeGrupos', () => {
  it('singular, plural y vacío', () => {
    expect(resumenDeGrupos({ vencidas: 3, hoy: 2, proximas: 1, sin_fecha: 625 })).toBe('3 vencidas · 2 para hoy · 1 próxima · 625 sin fecha')
    expect(resumenDeGrupos({ vencidas: 1, hoy: 0, proximas: 2, sin_fecha: 0 })).toBe('1 vencida · 2 próximas')
    expect(resumenDeGrupos({ vencidas: 0, hoy: 0, proximas: 0, sin_fecha: 0 })).toBe('Nada pendiente')
  })
})
