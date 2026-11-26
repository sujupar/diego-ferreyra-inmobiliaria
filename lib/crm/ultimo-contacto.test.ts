import { describe, it, expect } from 'vitest'
import { masReciente, ultimoContacto } from './ultimo-contacto'

// 2026-11-25 15:00 UTC = miércoles 12:00 de Argentina.
const ahora = new Date('2026-11-25T15:00:00Z')

describe('ultimoContacto', () => {
  it('nunca hubo contacto', () => {
    expect(ultimoContacto(null, ahora, 'coordinada')).toEqual({ texto: 'Sin contacto todavía', dias: null, alerta: false })
  })
  it('hoy', () => {
    expect(ultimoContacto('2026-11-25T12:30:00Z', ahora, 'solicitud')).toEqual({ texto: 'Último contacto: hoy', dias: 0, alerta: false })
  })
  it('ayer', () => {
    expect(ultimoContacto('2026-11-24T20:00:00Z', ahora, 'solicitud')).toEqual({ texto: 'Último contacto: ayer', dias: 1, alerta: false })
  })
  it('hace 2 días', () => {
    expect(ultimoContacto('2026-11-23T15:00:00Z', ahora, 'coordinada').texto).toBe('Último contacto: hace 2 días')
  })
  it('hace 3 días', () => {
    expect(ultimoContacto('2026-11-22T15:00:00Z', ahora, 'coordinada')).toEqual({ texto: 'Último contacto: hace 3 días', dias: 3, alerta: false })
  })
  it('23:30 → 00:30 de Argentina del día siguiente: ayer', () => {
    // 23:30 AR del 25 = 02:30 UTC del 26; 00:30 AR del 26 = 03:30 UTC del 26
    expect(ultimoContacto('2026-11-26T02:30:00Z', new Date('2026-11-26T03:30:00Z'), null).texto).toBe('Último contacto: ayer')
  })
  it('22:00 de Argentina del mismo día, ya mañana en UTC: hoy', () => {
    expect(ultimoContacto('2026-11-25T12:00:00Z', new Date('2026-11-26T01:00:00Z'), null).texto).toBe('Último contacto: hoy')
  })
  it('una fecha futura (relojes desfasados) se muestra como hoy', () => {
    expect(ultimoContacto('2026-11-25T15:03:00Z', ahora, null)).toEqual({ texto: 'Último contacto: hoy', dias: 0, alerta: false })
  })

  describe('alerta solo en Solicitud', () => {
    it('solicitud sin contacto → alerta', () => {
      expect(ultimoContacto(null, ahora, 'solicitud').alerta).toBe(true)
    })
    it('solicitud con contacto ayer → sin alerta', () => {
      expect(ultimoContacto('2026-11-24T15:00:00Z', ahora, 'solicitud').alerta).toBe(false)
    })
    it('solicitud con contacto hace 2 días → alerta', () => {
      expect(ultimoContacto('2026-11-23T15:00:00Z', ahora, 'solicitud').alerta).toBe(true)
    })
    it.each(['clase_gratuita', 'coordinada', 'realizada', 'entregada', 'seguimiento', 'captada', 'descartado', null])(
      'etapa %s sin contacto → sin alerta',
      (etapa) => {
        expect(ultimoContacto(null, ahora, etapa).alerta).toBe(false)
      },
    )
    it('coordinada con contacto hace 10 días → sin alerta', () => {
      expect(ultimoContacto('2026-11-15T15:00:00Z', ahora, 'coordinada').alerta).toBe(false)
    })
  })
})

// El "último contacto" junta tres fuentes (decisión del dueño 2026-11-26): la última
// llamada no anulada, el último WhatsApp marcado no anulado y la última visita de
// tasación realizada (`deals.visited_at`). La ruta `ficha` las lee y esto elige.
describe('masReciente', () => {
  it('sin ninguna fuente → null', () => {
    expect(masReciente([])).toBeNull()
    expect(masReciente([null, null, undefined])).toBeNull()
  })
  it('la visita de ayer gana sobre una llamada de hace 3 días', () => {
    expect(masReciente(['2026-11-22T15:00:00Z', null, '2026-11-24T18:00:00Z'])).toBe('2026-11-24T18:00:00Z')
  })
  it('un WhatsApp de hoy gana sobre la llamada de ayer', () => {
    expect(masReciente(['2026-11-24T15:00:00Z', '2026-11-25T13:00:00Z'])).toBe('2026-11-25T13:00:00Z')
  })
  it('compara instantes, no textos (formatos distintos de la misma base)', () => {
    // "+00:00" con microsegundos vs "Z": el texto mayor no es el instante mayor.
    expect(masReciente(['2026-11-25T10:00:00.123456+00:00', '2026-11-25T09:00:00Z'])).toBe('2026-11-25T10:00:00.123456+00:00')
    expect(masReciente(['2026-11-25T09:00:00-03:00', '2026-11-25T11:00:00Z'])).toBe('2026-11-25T09:00:00-03:00')
  })
  it('una fecha ilegible se ignora en vez de ganar', () => {
    expect(masReciente(['no-es-fecha', '2026-11-20T10:00:00Z'])).toBe('2026-11-20T10:00:00Z')
  })
})
