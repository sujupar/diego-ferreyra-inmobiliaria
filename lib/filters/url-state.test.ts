import { describe, it, expect } from 'vitest'
import { leerFiltros, escribirFiltros } from './url-state'

const DEFAULTS = { q: '', status: 'todos', advisor: '' }

describe('leerFiltros', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(leerFiltros(new URLSearchParams(''), DEFAULTS)).toEqual(DEFAULTS)
  })

  it('toma de la URL solo las claves conocidas', () => {
    const p = new URLSearchParams('q=palermo&status=publicada&colado=si')
    expect(leerFiltros(p, DEFAULTS)).toEqual({ q: 'palermo', status: 'publicada', advisor: '' })
  })

  it('una clave presente pero vacía cae al valor por defecto', () => {
    expect(leerFiltros(new URLSearchParams('status='), DEFAULTS).status).toBe('todos')
  })
})

describe('escribirFiltros', () => {
  it('omite lo que está en su valor por defecto: la URL queda limpia', () => {
    expect(escribirFiltros(DEFAULTS, DEFAULTS)).toBe('')
  })

  it('escribe solo lo que difiere del defecto', () => {
    expect(escribirFiltros({ q: 'palermo', status: 'todos', advisor: '' }, DEFAULTS)).toBe('q=palermo')
  })

  it('ordena las claves para que la misma selección dé siempre la misma URL', () => {
    const a = escribirFiltros({ q: 'x', status: 'publicada', advisor: '' }, DEFAULTS)
    const b = escribirFiltros({ status: 'publicada', q: 'x', advisor: '' } as typeof DEFAULTS, DEFAULTS)
    expect(a).toBe(b)
    expect(a).toBe('q=x&status=publicada')
  })

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const filtros = { q: 'agüero 950', status: 'publicada', advisor: 'ana' }
    expect(leerFiltros(new URLSearchParams(escribirFiltros(filtros, DEFAULTS)), DEFAULTS)).toEqual(filtros)
  })
})
