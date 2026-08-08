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

  it('valida un valor contra lista de permitidos', () => {
    const p = new URLSearchParams('status=publicada')
    const result = leerFiltros(p, DEFAULTS, { status: ['publicada', 'borrador', 'todos'] })
    expect(result.status).toBe('publicada')
  })

  it('un valor fuera de la lista de permitidos cae al default', () => {
    const p = new URLSearchParams('status=invalido')
    const result = leerFiltros(p, DEFAULTS, { status: ['publicada', 'borrador', 'todos'] })
    expect(result.status).toBe('todos')
  })

  it('una clave sin lista de permitidos acepta cualquier valor', () => {
    const p = new URLSearchParams('advisor=juan')
    const result = leerFiltros(p, DEFAULTS, { status: ['publicada', 'borrador', 'todos'] })
    expect(result.advisor).toBe('juan')
  })

  it('lista vacía de permitidos rechaza todo', () => {
    const p = new URLSearchParams('status=publicada')
    const result = leerFiltros(p, DEFAULTS, { status: [] })
    expect(result.status).toBe('todos')
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
    // IMPORTANTE: usar defaults NO alfabético para que el test falle sin .sort()
    const DEFAULTS_NO_ALFA = { zona: '', tipo: 'todos', ambientes: '' }
    const a = escribirFiltros({ zona: 'palermo', tipo: 'depto', ambientes: '2' }, DEFAULTS_NO_ALFA)
    const b = escribirFiltros({ tipo: 'depto', ambientes: '2', zona: 'palermo' } as typeof DEFAULTS_NO_ALFA, DEFAULTS_NO_ALFA)
    expect(a).toBe(b)
    // Alfabético: ambientes, tipo, zona
    expect(a).toBe('ambientes=2&tipo=depto&zona=palermo')
  })

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const filtros = { q: 'agüero 950', status: 'publicada', advisor: 'ana' }
    expect(leerFiltros(new URLSearchParams(escribirFiltros(filtros, DEFAULTS)), DEFAULTS)).toEqual(filtros)
  })
})
