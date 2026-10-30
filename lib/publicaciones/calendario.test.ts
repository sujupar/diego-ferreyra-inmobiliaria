import { describe, expect, it } from 'vitest'
import {
  aHoraArgentina,
  armarCalendario,
  fraseCalendario,
  mananaEnArgentina,
  reasignarHorarios,
  type HorariosPorDefecto,
  type OpcionesCalendario,
} from './calendario'

const HORARIOS: HorariosPorDefecto = {
  '1': ['19:00'],
  '2': ['12:30', '19:00'],
  '3': ['09:00', '13:00', '19:00'],
  semana: ['19:00'],
}
const AHORA = new Date('2026-10-29T15:00:00Z') // jueves 29/10 12:00 AR

function op(parcial: Partial<OpcionesCalendario>): OpcionesCalendario {
  return {
    ritmo: { tipo: 'por_dia', cantidad: 1 },
    inicio: '2026-10-30',
    soloHabiles: false,
    horarios: HORARIOS,
    ahora: AHORA,
    ...parcial,
  }
}
const iso = (ds: Date[]) => ds.map((d) => d.toISOString())

describe('armarCalendario', () => {
  it('1 por día desde el viernes 2026-10-30 da 19:00 AR (22:00 UTC) cada día', () => {
    expect(iso(armarCalendario(3, op({})))).toEqual([
      '2026-10-30T22:00:00.000Z',
      '2026-10-31T22:00:00.000Z',
      '2026-11-01T22:00:00.000Z',
    ])
  })

  it('2 por día reparte 12:30 y 19:00', () => {
    expect(iso(armarCalendario(6, op({ ritmo: { tipo: 'por_dia', cantidad: 2 } })))).toEqual([
      '2026-10-30T15:30:00.000Z',
      '2026-10-30T22:00:00.000Z',
      '2026-10-31T15:30:00.000Z',
      '2026-10-31T22:00:00.000Z',
      '2026-11-01T15:30:00.000Z',
      '2026-11-01T22:00:00.000Z',
    ])
  })

  it('3 por día usa 09:00, 13:00 y 19:00', () => {
    expect(iso(armarCalendario(3, op({ ritmo: { tipo: 'por_dia', cantidad: 3 } })))).toEqual([
      '2026-10-30T12:00:00.000Z',
      '2026-10-30T16:00:00.000Z',
      '2026-10-30T22:00:00.000Z',
    ])
  })

  it('solo días hábiles salta sábado y domingo', () => {
    expect(iso(armarCalendario(3, op({ soloHabiles: true })))).toEqual([
      '2026-10-30T22:00:00.000Z',
      '2026-11-02T22:00:00.000Z',
      '2026-11-03T22:00:00.000Z',
    ])
  })

  it('1 por semana usa el día de semana del inicio', () => {
    expect(iso(armarCalendario(3, op({ ritmo: { tipo: 'por_semana' } })))).toEqual([
      '2026-10-30T22:00:00.000Z',
      '2026-11-06T22:00:00.000Z',
      '2026-11-13T22:00:00.000Z',
    ])
  })

  it('todos ya escalona cada 10 minutos desde ahora+5', () => {
    expect(iso(armarCalendario(3, op({ ritmo: { tipo: 'todos_ya' } })))).toEqual([
      '2026-10-29T15:05:00.000Z',
      '2026-10-29T15:15:00.000Z',
      '2026-10-29T15:25:00.000Z',
    ])
  })

  it('todos ya redondea al minuto siguiente', () => {
    const ahora = new Date('2026-10-29T15:00:20Z')
    expect(iso(armarCalendario(1, op({ ritmo: { tipo: 'todos_ya' }, ahora })))).toEqual([
      '2026-10-29T15:06:00.000Z',
    ])
  })

  it('inicio hoy con horario pasado empieza en el siguiente', () => {
    const ahora = new Date('2026-10-30T23:00:00Z') // 20:00 AR del 30/10
    const fechas = armarCalendario(2, op({ ritmo: { tipo: 'por_dia', cantidad: 2 }, ahora }))
    expect(iso(fechas)).toEqual(['2026-10-31T15:30:00.000Z', '2026-10-31T22:00:00.000Z'])
  })

  it('nunca programa en el pasado aunque el inicio sea anterior a hoy', () => {
    const fechas = armarCalendario(2, op({ inicio: '2026-10-20' }))
    expect(fechas.every((d) => d > AHORA)).toBe(true)
    expect(iso(fechas)[0]).toBe('2026-10-29T22:00:00.000Z')
  })

  it('personalizado lunes y miércoles a las 10:00 y 18:00', () => {
    const fechas = armarCalendario(
      4,
      op({ ritmo: { tipo: 'personalizado', porDia: 2, dias: [1, 3], horarios: ['18:00', '10:00'] } }),
    )
    expect(iso(fechas)).toEqual([
      '2026-11-02T13:00:00.000Z',
      '2026-11-02T21:00:00.000Z',
      '2026-11-04T13:00:00.000Z',
      '2026-11-04T21:00:00.000Z',
    ])
  })

  it('cantidad 0 devuelve lista vacía', () => {
    expect(armarCalendario(0, op({}))).toEqual([])
  })

  it('horario inválido "25:00" lanza error', () => {
    expect(() =>
      armarCalendario(1, op({ horarios: { ...HORARIOS, '1': ['25:00'] } })),
    ).toThrow(/horario/i)
  })

  it('personalizado sin días lanza error en vez de colgarse', () => {
    expect(() =>
      armarCalendario(1, op({ ritmo: { tipo: 'personalizado', porDia: 1, dias: [], horarios: ['10:00'] } })),
    ).toThrow(/día/i)
  })
})

describe('fraseCalendario', () => {
  it('20 videos 1 por día', () => {
    const fechas = armarCalendario(20, op({}))
    expect(fraseCalendario(fechas, { tipo: 'por_dia', cantidad: 1 })).toBe(
      '20 videos, 1 por día a las 19:00 → del viernes 30/10 al miércoles 18/11',
    )
  })

  it('2 por día nombra los dos horarios', () => {
    const fechas = armarCalendario(4, op({ ritmo: { tipo: 'por_dia', cantidad: 2 } }))
    expect(fraseCalendario(fechas, { tipo: 'por_dia', cantidad: 2 })).toBe(
      '4 videos, 2 por día a las 12:30 y 19:00 → del viernes 30/10 al sábado 31/10',
    )
  })

  it('todos ya en el mismo día', () => {
    const fechas = armarCalendario(3, op({ ritmo: { tipo: 'todos_ya' } }))
    expect(fraseCalendario(fechas, { tipo: 'todos_ya' })).toBe(
      '3 videos, uno cada 10 minutos desde las 12:05 → el jueves 29/10',
    )
  })

  it('un solo video en singular', () => {
    const fechas = armarCalendario(1, op({}))
    expect(fraseCalendario(fechas, { tipo: 'por_dia', cantidad: 1 })).toBe(
      '1 video, 1 por día a las 19:00 → el viernes 30/10',
    )
  })

  it('sin videos', () => {
    expect(fraseCalendario([], { tipo: 'por_dia', cantidad: 1 })).toBe('Todavía no hay videos')
  })
})

describe('reasignarHorarios', () => {
  const A = '2026-10-30T22:00:00.000Z'
  const B = '2026-10-31T22:00:00.000Z'
  const C = '2026-11-01T22:00:00.000Z'

  it('el video movido al principio recibe el primer horario', () => {
    const x = { id: 'x', programado_para: A, hora_manual: false }
    const y = { id: 'y', programado_para: B, hora_manual: false }
    const z = { id: 'z', programado_para: C, hora_manual: false }
    const r = reasignarHorarios([z, x, y])
    expect(r.map((v) => [v.id, v.programado_para])).toEqual([
      ['z', A],
      ['x', B],
      ['y', C],
    ])
  })

  it('un video con hora manual conserva su hora y no consume horario', () => {
    const M = '2026-11-05T13:00:00.000Z'
    const x = { id: 'x', programado_para: A, hora_manual: false }
    const y = { id: 'y', programado_para: B, hora_manual: false }
    const m = { id: 'm', programado_para: M, hora_manual: true }
    const r = reasignarHorarios([m, y, x])
    expect(r.map((v) => [v.id, v.programado_para])).toEqual([
      ['m', M],
      ['y', A],
      ['x', B],
    ])
  })
})

describe('fechas argentinas', () => {
  it('mañana en Argentina a las 23:30 del 29/10', () => {
    expect(mananaEnArgentina(new Date('2026-10-30T02:30:00Z'))).toBe('2026-10-30')
  })

  it('aHoraArgentina convierte UTC a AR', () => {
    expect(aHoraArgentina(new Date('2026-10-30T22:00:00Z'))).toEqual({
      fecha: '2026-10-30',
      hora: '19:00',
      diaSemana: 5,
    })
  })
})
