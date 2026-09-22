import { describe, it, expect } from 'vitest'
import { comentarioCoincide, normalizarParaComparar } from './palabra-clave'

describe('normalizarParaComparar', () => {
  it('pasa a minúsculas y saca las tildes', () => {
    expect(normalizarParaComparar('TASACIÓN')).toBe('tasacion')
  })

  it('trata igual la tilde pegada y la tilde suelta (NFD de macOS)', () => {
    // 'ó' en una sola pieza vs 'o' + U+0301. El Finder, los PDF y la terminal de
    // macOS entregan la SEGUNDA forma. Sin normalizar, las dos cadenas se ven
    // idénticas en pantalla pero no son iguales, y la comparación devuelve false
    // SIN NINGÚN ERROR: el sistema simplemente no reacciona y parece apagado.
    expect(normalizarParaComparar('tasación')).toBe(normalizarParaComparar('tasación'))
  })

  it('saca los espacios de los bordes', () => {
    expect(normalizarParaComparar('  hola  ')).toBe('hola')
  })

  it('conserva la ñ como letra propia', () => {
    // La ñ NO es una n con tilde: sacársela cambia la palabra.
    expect(normalizarParaComparar('CABAÑA')).toBe('cabaña')
  })
})

describe('comentarioCoincide', () => {
  it('reconoce la palabra escrita igual', () => {
    expect(comentarioCoincide('PROPIEDAD', 'propiedad')).toBe(true)
  })

  it('la reconoce dentro de una frase', () => {
    expect(comentarioCoincide('me interesa, tasación por favor', 'TASACIÓN')).toBe(true)
  })

  it('la reconoce con tildes de un lado y no del otro', () => {
    expect(comentarioCoincide('quiero la tasacion', 'Tasación')).toBe(true)
  })

  it('la reconoce pegada a un signo de puntuación', () => {
    expect(comentarioCoincide('¡propiedad!', 'propiedad')).toBe(true)
    expect(comentarioCoincide('info, propiedad.', 'propiedad')).toBe(true)
  })

  it('la reconoce cuando es TODO el comentario, sin nada alrededor', () => {
    expect(comentarioCoincide('info', 'info')).toBe(true)
  })

  it('no coincide cuando la palabra no está', () => {
    expect(comentarioCoincide('qué lindo departamento', 'propiedad')).toBe(false)
  })

  it('no confunde la palabra metida adentro de otra', () => {
    // "impropiedades" contiene las letras de "propiedad", pero la persona no
    // escribió la palabra: mandarle un mensaje sería un error visible.
    expect(comentarioCoincide('impropiedades varias', 'propiedad')).toBe(false)
  })

  it('no coincide con comentario vacío ni nulo', () => {
    expect(comentarioCoincide('', 'propiedad')).toBe(false)
    expect(comentarioCoincide(null, 'propiedad')).toBe(false)
    expect(comentarioCoincide(undefined, 'propiedad')).toBe(false)
  })

  it('sin palabra configurada NUNCA coincide', () => {
    // Falla cerrado: si devolviera true, un reel sin palabra le mandaría un
    // mensaje privado a cualquiera que comentara cualquier cosa.
    expect(comentarioCoincide('lo que sea', null)).toBe(false)
    expect(comentarioCoincide('lo que sea', undefined)).toBe(false)
    expect(comentarioCoincide('lo que sea', '   ')).toBe(false)
  })

  it('encuentra la palabra en la segunda aparición si la primera estaba pegada', () => {
    // El buscador no puede rendirse en el primer calce fallido.
    expect(comentarioCoincide('impropiedades y propiedad', 'propiedad')).toBe(true)
  })

  it('acepta una frase corta como palabra clave', () => {
    expect(comentarioCoincide('quiero MAS INFO gracias', 'más info')).toBe(true)
  })

  it('no explota con caracteres especiales de expresión regular', () => {
    // El texto lo escribe el asesor: si alguna vez pone un paréntesis o un
    // asterisco, esto no puede tirar una excepción dentro del webhook.
    expect(comentarioCoincide('quiero info (ya)', 'info (ya)')).toBe(true)
    expect(comentarioCoincide('precio?', '?')).toBe(false)
  })
})
