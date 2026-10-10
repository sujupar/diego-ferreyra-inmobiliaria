import { describe, it, expect } from 'vitest'
import { validarPersonaNueva, telefonoCanonico } from './persona'

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

describe('telefonoCanonico', () => {
  it('normaliza un celular argentino a E.164 con "+"', () => {
    expect(telefonoCanonico('11 5823-4521')).toBe('+5491158234521')
  })
  it('un celular escrito con el "15" queda guardado en el mismo formato que sin el "15"', () => {
    expect(telefonoCanonico('011 15 5823-4521')).toBe(telefonoCanonico('11 5823-4521'))
  })
  it('si no se puede confirmar el número, deja el texto tal cual (recortado)', () => {
    expect(telefonoCanonico('  no es un teléfono  ')).toBe('no es un teléfono')
  })
})
