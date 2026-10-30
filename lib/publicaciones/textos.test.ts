import { describe, expect, it } from 'vitest'
import { LIMITES, ajustarDescripcion, ajustarTituloYoutube, problemasDeTexto } from './textos'

describe('ajustarDescripcion', () => {
  it('recorta un texto de 2.500 caracteres en un fin de frase, sin pasar de 2.200', () => {
    const frase = 'Esta es una frase de prueba que mide unos cincuenta. '
    const texto = frase.repeat(50).trim()
    expect(texto.length).toBeGreaterThan(2500)
    const r = ajustarDescripcion(texto)
    expect(r.length).toBeLessThanOrEqual(LIMITES.descripcion)
    expect(r.endsWith('.')).toBe(true)
  })

  it('un texto corto queda igual', () => {
    expect(ajustarDescripcion('Hola, ¿cómo están?')).toBe('Hola, ¿cómo están?')
  })

  it('con 35 hashtags conserva los primeros 30', () => {
    const tags = Array.from({ length: 35 }, (_, i) => `#tag${i + 1}`).join(' ')
    const r = ajustarDescripcion(`Texto.\n\n${tags}`)
    expect(r.match(/#\w+/g)).toHaveLength(30)
    expect(r).toContain('#tag30')
    expect(r).not.toContain('#tag31')
  })

  it('un texto en NFD sale en NFC', () => {
    const nfd = 'tasación'.normalize('NFD')
    expect(ajustarDescripcion(nfd)).toBe('tasación'.normalize('NFC'))
  })
})

describe('ajustarTituloYoutube', () => {
  it('saca los < y >', () => {
    expect(ajustarTituloYoutube('Cómo <b>vender</b> rápido')).toBe('Cómo bvender/b rápido')
  })

  it('un título de 120 caracteres queda en 100 o menos sin cortar una palabra', () => {
    const titulo = 'palabra '.repeat(15).trim() // 119 caracteres
    const r = ajustarTituloYoutube(titulo)
    expect(r.length).toBeLessThanOrEqual(LIMITES.tituloYoutube)
    expect(r.split(' ').every((p) => p === 'palabra')).toBe(true)
  })

  it('colapsa los espacios', () => {
    expect(ajustarTituloYoutube('  Hola    mundo \n')).toBe('Hola mundo')
  })
})

describe('problemasDeTexto', () => {
  it('marca un precio que no está en la transcripción', () => {
    expect(problemasDeTexto('Sale U$D 150.000 en Palermo.', 'hoy les cuento cómo tasar')).toEqual([
      'precio que no dijo Diego: U$D 150.000',
    ])
  })

  it('no marca un precio que Diego dijo', () => {
    expect(problemasDeTexto('Sale U$D 150.000.', 'la vendimos en 150.000 dólares')).toEqual([])
  })

  it('no marca un precio que Diego dijo en palabras ("150 mil")', () => {
    expect(problemasDeTexto('Sale U$D 150.000.', 'la vendimos en 150 mil dólares')).toEqual([])
  })

  it('marca un teléfono inventado', () => {
    expect(problemasDeTexto('Escribinos al 11 5555-1234.', 'hola a todos')).toEqual([
      'teléfono que no dijo Diego: 11 5555-1234',
    ])
  })

  it('un texto sin números no tiene problemas', () => {
    expect(problemasDeTexto('¿Sabías esto de las escrituras?', 'hola')).toEqual([])
  })
})
