import { describe, it, expect } from 'vitest'
import { parametrosDeListado, usaVentanaDeFechas, DIAS_SIN_LIMITE, ESTADO_SIN_RESPONDER } from './lead-query'

const base = { view: 'active' as const, days: 30, status: '', source: '' }

function dias(params: URLSearchParams): number {
  return Number(params.get('days'))
}

describe('usaVentanaDeFechas', () => {
  it('la papelera nunca usa ventana', () => {
    expect(usaVentanaDeFechas('trash', ESTADO_SIN_RESPONDER)).toBe(false)
    expect(usaVentanaDeFechas('trash', 'contacted')).toBe(false)
  })

  it('"sin responder" tampoco: es el mismo conjunto que cuenta el badge', () => {
    expect(usaVentanaDeFechas('active', ESTADO_SIN_RESPONDER)).toBe(false)
  })

  it('los demás estados sí la usan', () => {
    expect(usaVentanaDeFechas('active', 'contacted')).toBe(true)
    expect(usaVentanaDeFechas('active', 'scheduled')).toBe(true)
    expect(usaVentanaDeFechas('active', '')).toBe(true)
  })
})

describe('parametrosDeListado', () => {
  it('en "sin responder" NO recorta por fecha — el badge cuenta todos y la pantalla tiene que mostrarlos', () => {
    const p = parametrosDeListado({ ...base, status: ESTADO_SIN_RESPONDER, days: 30 })
    expect(dias(p)).toBe(DIAS_SIN_LIMITE)
    expect(p.get('status')).toBe(ESTADO_SIN_RESPONDER)
  })

  it('el período elegido no cambia nada en "sin responder"', () => {
    const siete = parametrosDeListado({ ...base, status: ESTADO_SIN_RESPONDER, days: 7 })
    const anio = parametrosDeListado({ ...base, status: ESTADO_SIN_RESPONDER, days: 365 })
    expect(dias(siete)).toBe(dias(anio))
  })

  it('en los otros estados el período elegido SÍ manda', () => {
    expect(dias(parametrosDeListado({ ...base, status: 'contacted', days: 7 }))).toBe(7)
    expect(dias(parametrosDeListado({ ...base, status: 'scheduled', days: 365 }))).toBe(365)
  })

  it('la papelera sigue sin heredar el filtro de días', () => {
    const p = parametrosDeListado({ ...base, view: 'trash', days: 7, status: 'contacted', source: 'landing' })
    expect(p.get('trashed')).toBe('true')
    expect(dias(p)).toBe(DIAS_SIN_LIMITE)
    // Ni estado ni fuente se mandan en la papelera: muestra TODO lo borrado.
    expect(p.get('status')).toBeNull()
    expect(p.get('source')).toBeNull()
  })

  it('la fuente viaja cuando está elegida, y no cuando no', () => {
    expect(parametrosDeListado({ ...base, source: 'landing' }).get('source')).toBe('landing')
    expect(parametrosDeListado({ ...base, source: '' }).get('source')).toBeNull()
  })

  it('el límite por default es el de siempre', () => {
    expect(parametrosDeListado(base).get('limit')).toBe('200')
  })
})
