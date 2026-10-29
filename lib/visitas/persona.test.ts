import { describe, it, expect } from 'vitest'
import { validarPersonaNueva, telefonoCanonico, telefonoEfectivo } from './persona'

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

describe('telefonoEfectivo', () => {
  it('el teléfono guardado gana si ya es válido, aunque llegue uno distinto del navegador', () => {
    expect(telefonoEfectivo('+5491144444444', '11 5823-4521')).toBe('+5491144444444')
  })
  it('si no hay guardado válido, usa el que manda el navegador', () => {
    expect(telefonoEfectivo(null, '11 5823-4521')).toBe('11 5823-4521')
    expect(telefonoEfectivo('123', '11 5823-4521')).toBe('11 5823-4521')
  })
  it('sin ninguno de los dos, devuelve vacío (la validación es de quien llama)', () => {
    expect(telefonoEfectivo(null, undefined)).toBe('')
  })
  it('guardado de 12 dígitos inválido pierde contra el corregido', () => {
    expect(telefonoEfectivo('541103305864', '+5491149410027')).toBe('+5491149410027')
  })
  it('guardado válido sigue ganando', () => {
    expect(telefonoEfectivo('541161400496', '+5491100000000')).toBe('541161400496')
  })
})

describe('telefonoCanonico con la regla del 549', () => {
  it('canónico de un número con 540', () => {
    expect(telefonoCanonico('5401162653949')).toBe('+5491162653949')
  })
  it('canónico no inventa extranjero', () => {
    expect(telefonoCanonico('4571430985')).toBe('4571430985')
  })
  it('un número extranjero escrito con su código (+598) se guarda en E.164', () => {
    expect(telefonoCanonico('+598 94 123 456')).toBe('+59894123456')
  })
  it('el celular argentino con "15" queda con el 549', () => {
    expect(telefonoCanonico('11 15 5823-4521')).toBe('+5491158234521')
  })
})

describe('telefonoEfectivo cuando ninguno sirve para WhatsApp', () => {
  it('si el guardado no es un celular válido, gana el enviado aunque tampoco lo sea', () => {
    expect(telefonoEfectivo('4941-0027', '123')).toBe('123')
  })
})
