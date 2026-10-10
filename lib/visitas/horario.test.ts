import { describe, it, expect } from 'vitest'
import {
  construirInstante, validarHorarioDeVisita, formatearFechaHora, formatearFechaLarga,
  fechaEnArgentina, horaEnArgentina, diasParaElegir, HORARIOS_SUGERIDOS, sumarDias, yaOcurrio,
} from './horario'

const AHORA = new Date('2026-10-10T15:00:00Z') // sábado 10/10, 12:00 en Argentina

describe('construirInstante', () => {
  it('10:30 en Argentina es 13:30 UTC', () => {
    expect(construirInstante('2026-10-10', '10:30')?.toISOString()).toBe('2026-10-10T13:30:00.000Z')
  })
  it('23:30 en Argentina queda en el día argentino aunque en UTC sea el siguiente', () => {
    const d = construirInstante('2026-10-10', '23:30')
    expect(d?.toISOString()).toBe('2026-10-11T02:30:00.000Z')
    expect(fechaEnArgentina(d as Date)).toBe('2026-10-10')
  })
  it('rechaza fechas que no existen y formatos inválidos', () => {
    expect(construirInstante('2026-02-31', '10:00')).toBeNull()
    expect(construirInstante('2026-10-10', '25:00')).toBeNull()
    expect(construirInstante('2026-10-10', '10:3')).toBeNull()
    expect(construirInstante('10/10/2026', '10:00')).toBeNull()
    expect(construirInstante('', '')).toBeNull()
  })
})

describe('validarHorarioDeVisita', () => {
  it('acepta una visita futura', () => {
    expect(validarHorarioDeVisita('2026-10-12', '11:00', AHORA).ok).toBe(true)
  })
  it('acepta una visita pasada de hasta 60 días (para documentarla)', () => {
    expect(validarHorarioDeVisita('2026-08-15', '11:00', AHORA).ok).toBe(true)
  })
  it('rechaza más de 60 días atrás y más de 6 meses adelante', () => {
    expect(validarHorarioDeVisita('2026-07-01', '11:00', AHORA))
      .toEqual({ ok: false, error: 'Solo se pueden registrar visitas de los últimos 60 días' })
    expect(validarHorarioDeVisita('2027-06-01', '11:00', AHORA))
      .toEqual({ ok: false, error: 'Elegí una fecha dentro de los próximos 6 meses' })
  })
  it('rechaza un día inválido con un mensaje entendible', () => {
    expect(validarHorarioDeVisita('2026-02-31', '10:00', AHORA))
      .toEqual({ ok: false, error: 'Elegí un día y una hora válidos' })
  })
})

describe('mostrar fechas', () => {
  it('formato corto con día de la semana y 24 h', () => {
    expect(formatearFechaHora('2026-10-10T13:30:00Z')).toBe('sáb 10/10 · 10:30')
    expect(formatearFechaHora(new Date('2026-10-11T02:30:00Z'))).toBe('sáb 10/10 · 23:30')
  })
  it('formato largo', () => {
    expect(formatearFechaLarga('2026-10-12T14:00:00Z')).toBe('lunes 12 de octubre, 11:00')
  })
  it('hora en Argentina a medianoche no dice 24:00', () => {
    expect(horaEnArgentina(new Date('2026-10-11T03:00:00Z'))).toBe('00:00')
  })
})

describe('selector de días y horarios', () => {
  it('arranca en Hoy y Mañana, después el día abreviado', () => {
    const dias = diasParaElegir('2026-10-10', 4)
    expect(dias.map(d => d.etiqueta)).toEqual(['Hoy', 'Mañana', 'Lun', 'Mar'])
    expect(dias.map(d => d.numero)).toEqual(['10', '11', '12', '13'])
    expect(dias[2].fecha).toBe('2026-10-12')
  })
  it('suma días cruzando fin de mes', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
  })
  it('horarios de 8:00 a 20:30 cada media hora', () => {
    expect(HORARIOS_SUGERIDOS[0]).toBe('08:00')
    expect(HORARIOS_SUGERIDOS[HORARIOS_SUGERIDOS.length - 1]).toBe('20:30')
    expect(HORARIOS_SUGERIDOS).toHaveLength(26)
  })
})

describe('yaOcurrio', () => {
  it('un instante anterior a ahora ya ocurrió', () => {
    expect(yaOcurrio(construirInstante('2026-10-10', '11:00'), AHORA)).toBe(true)
  })
  it('el mismo instante cuenta como ocurrido (no es futuro)', () => {
    expect(yaOcurrio(construirInstante('2026-10-10', '12:00'), AHORA)).toBe(true)
  })
  it('un instante posterior todavía no ocurrió', () => {
    expect(yaOcurrio(construirInstante('2026-10-10', '12:30'), AHORA)).toBe(false)
  })
  it('sin instante (día u hora sin elegir, o inválidos) no ocurrió', () => {
    expect(yaOcurrio(null, AHORA)).toBe(false)
  })
})
