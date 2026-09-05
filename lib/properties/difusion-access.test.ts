import { describe, it, expect } from 'vitest'
import { alcanceDifusion, puedeVerBotonDifusion } from './difusion-access'

/**
 * La incidencia que originó esto: un asesor intentó crear la landing de una
 * propiedad asignada a otra persona y recibió "forbidden". El dueño decidió el
 * 5 de septiembre de 2026 que los asesores difunden CUALQUIER propiedad.
 */
describe('difundir — landing, portales y campaña', () => {
  it('EL CAMBIO: el asesor difunde cualquier propiedad, no solo las suyas', () => {
    expect(alcanceDifusion('difundir', 'asesor')).toBe('todas')
  })

  it('el asesor maneja la campaña de punta a punta', () => {
    // Decisión del dueño: antes pausar y reactivar era solo del manager.
    expect(alcanceDifusion('gestionar_campana', 'asesor')).toBe('todas')
  })

  it('operaciones sigue pudiendo todo', () => {
    for (const rol of ['admin', 'dueno', 'coordinador']) {
      expect(alcanceDifusion('difundir', rol), rol).toBe('todas')
      expect(alcanceDifusion('gestionar_campana', rol), rol).toBe('todas')
      expect(alcanceDifusion('ver_difusion', rol), rol).toBe('todas')
    }
  })
})

describe('el abogado NO gana nada', () => {
  it('puede MIRAR el estado de difusión, como hasta ahora', () => {
    expect(alcanceDifusion('ver_difusion', 'abogado')).toBe('todas')
  })

  it('pero NO puede publicar ni gastar', () => {
    // Es el riesgo más grave de este cambio: que al abrir la regla se le
    // regalara al abogado publicar en portales o lanzar campañas con plata real.
    expect(alcanceDifusion('difundir', 'abogado')).toBe('ninguna')
    expect(alcanceDifusion('gestionar_campana', 'abogado')).toBe('ninguna')
  })
})

describe('falla cerrado', () => {
  it('un rol desconocido no alcanza nada', () => {
    // Lista blanca, no negación: el proyecto ya se quemó con `!== 'asesor'`,
    // que le daba al abogado permisos que nadie había decidido darle.
    for (const rol of ['agent', 'viewer', 'cualquier_cosa', 'ADMIN', 'Asesor']) {
      expect(alcanceDifusion('difundir', rol), rol).toBe('ninguna')
    }
  })

  it('sin rol tampoco', () => {
    expect(alcanceDifusion('difundir', null)).toBe('ninguna')
    expect(alcanceDifusion('difundir', undefined)).toBe('ninguna')
    expect(alcanceDifusion('difundir', '')).toBe('ninguna')
  })
})

describe('puedeVerBotonDifusion — para la pantalla', () => {
  it('muestra el botón a quien puede usarlo', () => {
    expect(puedeVerBotonDifusion('difundir', 'asesor')).toBe(true)
    expect(puedeVerBotonDifusion('gestionar_campana', 'asesor')).toBe(true)
  })

  it('no le ofrece al abogado botones que el servidor le va a rechazar', () => {
    expect(puedeVerBotonDifusion('difundir', 'abogado')).toBe(false)
    expect(puedeVerBotonDifusion('gestionar_campana', 'abogado')).toBe(false)
  })
})
