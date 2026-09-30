import { describe, it, expect } from 'vitest'
import { resumenDeCambios, esFalloActualizacion, mensajeDeErrorDeRed } from './editar-aviso-estado'

const campos = [
  { id: 'MAINTENANCE_FEE', name: 'Expensas', valueType: 'number_unit' as const, required: false },
  { id: 'DISPOSITION', name: 'Disposición', valueType: 'list' as const, required: false, allowedValues: [{ id: '1', name: 'Frente' }, { id: '2', name: 'Contrafrente' }] },
]
it('arma una línea por cambio con nombres legibles', () => {
  expect(resumenDeCambios({ MAINTENANCE_FEE: { value_name: '600000 ARS' }, DISPOSITION: { value_id: '2' } }, campos,
    { DISPOSITION: { value_id: '1' } })).toEqual(['Expensas: vacío → 600000 ARS', 'Disposición: Frente → Contrafrente'])
})
it('vaciar se muestra como "vacío"', () => {
  expect(resumenDeCambios({ DISPOSITION: null }, campos, { DISPOSITION: { value_id: '1' } })).toEqual(['Disposición: Frente → vacío'])
})

describe('mensajeDeErrorDeRed', () => {
  // Si el fetch mismo tira (sin red, DNS caído, etc.), leerJson() nunca
  // llega a correr: no hay Response que leer. guardar() tiene que mostrar un
  // mensaje en español, no dejar pasar el error crudo del navegador.
  it('da un mensaje en español ante un TypeError de fetch (sin conexión)', () => {
    expect(mensajeDeErrorDeRed(new TypeError('Failed to fetch'))).toBe('No se pudo conectar. Revisá la conexión y probá de nuevo.')
  })
  it('da el mismo mensaje para cualquier excepción, no solo TypeError', () => {
    expect(mensajeDeErrorDeRed('algo raro')).toBe('No se pudo conectar. Revisá la conexión y probá de nuevo.')
  })
})

describe('esFalloActualizacion', () => {
  it('reconoce un registro con motivo string', () => {
    expect(esFalloActualizacion({ motivo: 'algo falló' })).toBe(true)
  })
  it('rechaza null, undefined, y formas sin motivo válido', () => {
    expect(esFalloActualizacion(null)).toBe(false)
    expect(esFalloActualizacion(undefined)).toBe(false)
    expect(esFalloActualizacion({})).toBe(false)
    expect(esFalloActualizacion({ motivo: 123 })).toBe(false)
    expect(esFalloActualizacion('algo')).toBe(false)
  })
})
