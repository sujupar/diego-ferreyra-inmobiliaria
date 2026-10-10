import { describe, it, expect } from 'vitest'
import { validarPersonaNueva } from './persona'

describe('validarPersonaNueva', () => {
  it('acepta nombre y teléfono, limpia espacios y deja el email en minúsculas', () => {
    expect(validarPersonaNueva({ nombre: '  Sofía   Benítez ', telefono: '11 5823-4521', email: ' Sofia@Mail.COM ' }))
      .toEqual({ ok: true, valor: { nombre: 'Sofía Benítez', telefono: '11 5823-4521', email: 'sofia@mail.com' } })
  })
  it('el email es opcional', () => {
    const r = validarPersonaNueva({ nombre: 'Ana López', telefono: '+54 9 11 5823 4521', email: '' })
    expect(r.ok && r.valor.email).toBeNull()
  })
  it('junta TODOS los errores', () => {
    expect(validarPersonaNueva({ nombre: '1', telefono: '123', email: 'mal' })).toEqual({
      ok: false,
      errores: [
        'Escribí el nombre de la persona',
        'El teléfono tiene que tener al menos 10 números (con código de área)',
        'El email no es válido',
      ],
    })
  })
  it('un nombre con tildes descompuestas (macOS) queda compuesto', () => {
    const r = validarPersonaNueva({ nombre: 'López', telefono: '1158234521' })
    expect(r.ok && r.valor.nombre).toBe('López')
  })
  it('tolera entradas que no son texto', () => {
    expect(validarPersonaNueva({ nombre: 42, telefono: null }).ok).toBe(false)
  })
})
