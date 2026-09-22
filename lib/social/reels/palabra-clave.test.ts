import { describe, it, expect } from 'vitest'
import {
  comentarioCoincide,
  limpiarPalabras,
  normalizarParaComparar,
  separarPalabras,
  MAX_PALABRAS,
  MAX_CARACTERES_PALABRAS,
} from './palabra-clave'

describe('separarPalabras', () => {
  it('separa por coma y saca los espacios de los bordes', () => {
    expect(separarPalabras('parque rivadavia, doblas ,info')).toEqual(['parque rivadavia', 'doblas', 'info'])
  })

  it('descarta las vacías', () => {
    expect(separarPalabras('doblas, , info,')).toEqual(['doblas', 'info'])
  })

  it('descarta las repetidas aunque cambien tildes o mayúsculas, y se queda con la primera', () => {
    expect(separarPalabras('Tasación, TASACION, tasación, info')).toEqual(['Tasación', 'info'])
  })

  it('una sola palabra sin comas es una lista de una', () => {
    // Los reels guardados antes de este cambio tienen una sola palabra: tienen
    // que seguir funcionando igual, sin migrar nada.
    expect(separarPalabras('propiedad')).toEqual(['propiedad'])
  })

  it('nulo, vacío o solo comas dan una lista vacía', () => {
    expect(separarPalabras(null)).toEqual([])
    expect(separarPalabras(undefined)).toEqual([])
    expect(separarPalabras('')).toEqual([])
    expect(separarPalabras(' , ,, ')).toEqual([])
  })

  it('junta los espacios de más dentro de una frase', () => {
    expect(separarPalabras('parque    rivadavia')).toEqual(['parque rivadavia'])
  })
})

describe('limpiarPalabras', () => {
  it('devuelve la lista limpia, separada por coma y espacio', () => {
    expect(limpiarPalabras('doblas, DOBLAS, , info')).toEqual({ ok: true, valor: 'doblas, info' })
  })

  it('una lista vacía se guarda como null (sin palabra no se puede activar)', () => {
    expect(limpiarPalabras('  , ')).toEqual({ ok: true, valor: null })
    expect(limpiarPalabras(null)).toEqual({ ok: true, valor: null })
  })

  it(`acepta hasta ${MAX_PALABRAS} palabras`, () => {
    const diez = Array.from({ length: MAX_PALABRAS }, (_, i) => `p${i}`).join(', ')
    expect(limpiarPalabras(diez).ok).toBe(true)
  })

  it(`rechaza más de ${MAX_PALABRAS} palabras con un mensaje en castellano`, () => {
    const once = Array.from({ length: MAX_PALABRAS + 1 }, (_, i) => `p${i}`).join(', ')
    const r = limpiarPalabras(once)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/10 palabras/)
  })

  it(`rechaza una lista de más de ${MAX_CARACTERES_PALABRAS} caracteres`, () => {
    const larga = ['a'.repeat(120), 'b'.repeat(90)].join(', ')
    const r = limpiarPalabras(larga)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/200/)
  })

  it('las repetidas no cuentan para el tope', () => {
    // Once escritas, pero dos son la misma: quedan diez y se acepta.
    const conRepetida = [...Array.from({ length: MAX_PALABRAS }, (_, i) => `p${i}`), 'P0'].join(', ')
    expect(limpiarPalabras(conRepetida).ok).toBe(true)
  })
})

describe('comentarioCoincide con varias palabras', () => {
  const palabras = 'parque rivadavia, doblas'

  it('coincide con cualquiera de las palabras', () => {
    expect(comentarioCoincide('Doblas precio', palabras)).toBe(true)
    expect(comentarioCoincide('Parque Rivadavía!', palabras)).toBe(true)
  })

  it('no coincide si no está ninguna', () => {
    expect(comentarioCoincide('info', palabras)).toBe(false)
  })

  it('cada palabra tiene que estar entera, como con una sola', () => {
    // "doblaa" (un error de tipeo real del reel del 20/09) no es "doblas".
    expect(comentarioCoincide('doblaa', palabras)).toBe(false)
  })

  it('una lista de solo comas nunca coincide (falla cerrado)', () => {
    expect(comentarioCoincide('lo que sea', ' , , ')).toBe(false)
  })
})

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
