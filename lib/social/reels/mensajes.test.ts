import { describe, it, expect } from 'vitest'
import { limpiarFrases, validarMensajes, MAX_FRASES, MAX_CARACTERES_FRASE, MAX_CARACTERES_BOTON } from './mensajes'

describe('limpiarFrases', () => {
  it('saca los espacios de los bordes y descarta las vacías', () => {
    expect(limpiarFrases(['  Hola 📩 ', '', '   ', 'Chau'])).toEqual({ ok: true, valor: ['Hola 📩', 'Chau'] })
  })

  it(`acepta hasta ${MAX_FRASES}`, () => {
    expect(limpiarFrases(['a', 'b', 'c']).ok).toBe(true)
  })

  it(`rechaza más de ${MAX_FRASES}`, () => {
    const r = limpiarFrases(['a', 'b', 'c', 'd'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/3 frases/)
  })

  it('sin ninguna frase no deja guardar: el comentario quedaría sin respuesta', () => {
    const r = limpiarFrases(['  ', ''])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/al menos una/)
  })

  it(`rechaza una frase de más de ${MAX_CARACTERES_FRASE} caracteres`, () => {
    const r = limpiarFrases(['x'.repeat(MAX_CARACTERES_FRASE + 1)])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/300/)
  })

  it('normaliza la tilde suelta de macOS (NFD) para no contar caracteres de más', () => {
    const r = limpiarFrases(['Gracias por el interés'.normalize('NFD')])
    expect(r.ok && r.valor[0]).toBe('Gracias por el interés'.normalize('NFC'))
  })
})

describe('validarMensajes', () => {
  const buenos = {
    respuestas_con_privado: ['¡Listo! Te escribí al privado 📩'],
    respuestas_sin_privado: ['¡Gracias! 🙌'],
    dm_texto: 'Hola, ¿te paso la ficha?',
    dm_boton: 'Sí, pasámela',
    dm_seguimiento: 'Acá la tenés 👇',
  }

  it('con todo en orden devuelve los campos limpios', () => {
    const r = validarMensajes(buenos)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toEqual(buenos)
  })

  it('solo valida lo que vino: un pedido parcial no toca el resto', () => {
    const r = validarMensajes({ dm_boton: '  Quiero verla  ' })
    expect(r).toEqual({ ok: true, valor: { dm_boton: 'Quiero verla' } })
  })

  it(`rechaza un botón de más de ${MAX_CARACTERES_BOTON} caracteres (Instagram tira el mensaje entero)`, () => {
    const r = validarMensajes({ dm_boton: 'Sí, por favor pasámela ya' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/botón/)
  })

  it('rechaza un botón vacío', () => {
    expect(validarMensajes({ dm_boton: '   ' }).ok).toBe(false)
  })

  it('un privado vacío vuelve al de fábrica (se guarda null)', () => {
    expect(validarMensajes({ dm_texto: '   ', dm_seguimiento: '' })).toEqual({ ok: true, valor: { dm_texto: null, dm_seguimiento: null } })
  })

  it('el error de las frases dice cuál de los dos grupos es', () => {
    const r = validarMensajes({ respuestas_sin_privado: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/si el privado no sale/i)
  })
})
