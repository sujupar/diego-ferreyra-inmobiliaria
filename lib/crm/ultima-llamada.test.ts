import { describe, it, expect } from 'vitest'
import { ultimaLlamada } from './ultima-llamada'

// 2026-11-25 15:00 UTC = miércoles 12:00 de Argentina.
const ahora = new Date('2026-11-25T15:00:00Z')

describe('ultimaLlamada', () => {
  it('nunca se llamó', () => {
    expect(ultimaLlamada(null, ahora, 'coordinada')).toEqual({ texto: 'Sin llamar todavía', dias: null, alerta: false })
  })
  it('hoy', () => {
    expect(ultimaLlamada('2026-11-25T12:30:00Z', ahora, 'solicitud')).toEqual({ texto: 'Última llamada: hoy', dias: 0, alerta: false })
  })
  it('ayer', () => {
    expect(ultimaLlamada('2026-11-24T20:00:00Z', ahora, 'solicitud')).toEqual({ texto: 'Última llamada: ayer', dias: 1, alerta: false })
  })
  it('hace 2 días', () => {
    expect(ultimaLlamada('2026-11-23T15:00:00Z', ahora, 'coordinada').texto).toBe('Última llamada: hace 2 días')
  })
  it('hace 3 días', () => {
    expect(ultimaLlamada('2026-11-22T15:00:00Z', ahora, 'coordinada')).toEqual({ texto: 'Última llamada: hace 3 días', dias: 3, alerta: false })
  })
  it('23:30 → 00:30 de Argentina del día siguiente: ayer', () => {
    // 23:30 AR del 25 = 02:30 UTC del 26; 00:30 AR del 26 = 03:30 UTC del 26
    expect(ultimaLlamada('2026-11-26T02:30:00Z', new Date('2026-11-26T03:30:00Z'), null).texto).toBe('Última llamada: ayer')
  })
  it('22:00 de Argentina del mismo día, ya mañana en UTC: hoy', () => {
    expect(ultimaLlamada('2026-11-25T12:00:00Z', new Date('2026-11-26T01:00:00Z'), null).texto).toBe('Última llamada: hoy')
  })
  it('una fecha futura (relojes desfasados) se muestra como hoy', () => {
    expect(ultimaLlamada('2026-11-25T15:03:00Z', ahora, null)).toEqual({ texto: 'Última llamada: hoy', dias: 0, alerta: false })
  })

  describe('alerta solo en Solicitud', () => {
    it('solicitud sin llamar → alerta', () => {
      expect(ultimaLlamada(null, ahora, 'solicitud').alerta).toBe(true)
    })
    it('solicitud llamada ayer → sin alerta', () => {
      expect(ultimaLlamada('2026-11-24T15:00:00Z', ahora, 'solicitud').alerta).toBe(false)
    })
    it('solicitud llamada hace 2 días → alerta', () => {
      expect(ultimaLlamada('2026-11-23T15:00:00Z', ahora, 'solicitud').alerta).toBe(true)
    })
    it.each(['clase_gratuita', 'coordinada', 'realizada', 'entregada', 'seguimiento', 'captada', 'descartado', null])(
      'etapa %s sin llamar → sin alerta',
      (etapa) => {
        expect(ultimaLlamada(null, ahora, etapa).alerta).toBe(false)
      },
    )
    it('coordinada llamada hace 10 días → sin alerta', () => {
      expect(ultimaLlamada('2026-11-15T15:00:00Z', ahora, 'coordinada').alerta).toBe(false)
    })
  })
})
