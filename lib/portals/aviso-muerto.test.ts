import { describe, it, expect } from 'vitest'
import { avisoMlCerrado, avisoApEliminado, errorDeAvisoInexistente, mensajeAvisoInexistente } from './aviso-muerto'
import { PortalAdapterError } from './types'

describe('aviso muerto', () => {
  it('ML cerrado', () => {
    expect(avisoMlCerrado('closed')).toBe(true)
    expect(avisoMlCerrado('active')).toBe(false)
    expect(avisoMlCerrado(undefined)).toBe(false)
  })
  it('Argenprop eliminado sin importar mayúsculas', () => {
    expect(avisoApEliminado('Eliminado')).toBe(true)
    expect(avisoApEliminado('ELIMINADO')).toBe(true)
    expect(avisoApEliminado('VIGENTE')).toBe(false)
    expect(avisoApEliminado(undefined)).toBe(false)
  })
  it('404 / ENT001 de la lectura = aviso inexistente', () => {
    expect(errorDeAvisoInexistente(new PortalAdapterError('x', 'argenprop', 'unknown', false, 'HTTP 404 {"Code":"ENT001"}'))).toBe(true)
    expect(errorDeAvisoInexistente(new Error('Argenprop 404: no encontrado'))).toBe(true)
    expect(errorDeAvisoInexistente(new Error('ENT001'))).toBe(true)
    expect(errorDeAvisoInexistente(new Error('timeout'))).toBe(false)
  })
  it('mensaje', () => {
    expect(mensajeAvisoInexistente('Argenprop')).toBe('El aviso ya no existe en Argenprop; volvé a publicarlo desde su asistente.')
  })
})
