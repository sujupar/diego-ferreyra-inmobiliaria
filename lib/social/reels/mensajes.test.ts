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

describe('enlaces en los mensajes (revisión de seguridad)', () => {
  it('rechaza un enlace a otro sitio en el privado: sería phishing desde la cuenta de la inmobiliaria', () => {
    const r = validarMensajes({ dm_texto: 'Mirala acá: https://sitio-falso.com/ficha' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/enlace/)
  })

  it('rechaza también un dominio sin https y un "www."', () => {
    expect(validarMensajes({ dm_seguimiento: 'entrá a sitio-falso.com' }).ok).toBe(false)
    expect(validarMensajes({ dm_seguimiento: 'www.otra-cosa.net' }).ok).toBe(false)
    expect(validarMensajes({ respuestas_sin_privado: ['Gracias! mirá bit.ly/abc'] }).ok).toBe(false)
  })

  it('acepta los dominios de la inmobiliaria', () => {
    expect(validarMensajes({ dm_texto: 'Todo en inmodf.com.ar' }).ok).toBe(true)
    expect(validarMensajes({ dm_texto: 'https://inmobiliariadiegoferreyra.com/tasacion' }).ok).toBe(true)
  })

  it('no confunde texto normal con un dominio', () => {
    expect(validarMensajes({ dm_texto: 'Hola! Te paso la ficha. ¿Te sirve? Son 3 amb.' }).ok).toBe(true)
    expect(validarMensajes({ respuestas_con_privado: ['¡Listo! Te escribí al privado 📩'] }).ok).toBe(true)
  })
})

describe('el privado lleva un botón con enlace: tope de 640', () => {
  it('rechaza un privado de más de 640 caracteres, con el motivo', () => {
    const r = validarMensajes({ dm_texto: 'x'.repeat(641) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/640/)
  })

  it('acepta uno de 640 justo', () => {
    expect(validarMensajes({ dm_texto: 'x'.repeat(640) }).ok).toBe(true)
  })
})
