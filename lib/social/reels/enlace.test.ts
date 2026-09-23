import { describe, it, expect } from 'vitest'
import { enlaceDelReel } from './enlace'

describe('enlaceDelReel', () => {
  it('lleva a la landing con las marcas de que vino de un reel de Instagram', () => {
    const url = new URL(enlaceDelReel('https://inmodf.com.ar', 'depto-doblas', '1fb62134-abf6-436f-9705-94e66bba0593'))
    expect(url.origin + url.pathname).toBe('https://inmodf.com.ar/p/depto-doblas')
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    expect(url.searchParams.get('utm_medium')).toBe('reel')
    // La misma campaña que usa la landing: así las métricas de la propiedad suman todo.
    expect(url.searchParams.get('utm_campaign')).toBe('propiedad_depto-doblas')
    expect(url.searchParams.get('utm_content')).toBe('reel_1fb62134')
  })

  it('no duplica la barra si la base termina en /', () => {
    expect(enlaceDelReel('https://inmodf.com.ar/', 'x', 'abcdefgh-1')).toMatch(/^https:\/\/inmodf\.com\.ar\/p\/x\?/)
  })

  it('escapa el slug por si trae algo raro', () => {
    expect(enlaceDelReel('https://inmodf.com.ar', 'a b', 'abcdefgh')).toContain('/p/a%20b?')
  })
})
