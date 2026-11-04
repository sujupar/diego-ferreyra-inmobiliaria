import { describe, it, expect } from 'vitest'
import { enlaceDelReel, enlacePersonalizadoConMarcas, llevaMarcas } from './enlace'

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

  it('un comentario de Facebook marca facebook como origen (el resto igual)', () => {
    const url = new URL(enlaceDelReel('https://inmodf.com.ar', 'depto-doblas', '1fb62134-abf6', 'facebook'))
    expect(url.searchParams.get('utm_source')).toBe('facebook')
    expect(url.searchParams.get('utm_campaign')).toBe('propiedad_depto-doblas')
  })

  it('no duplica la barra si la base termina en /', () => {
    expect(enlaceDelReel('https://inmodf.com.ar/', 'x', 'abcdefgh-1')).toMatch(/^https:\/\/inmodf\.com\.ar\/p\/x\?/)
  })

  it('escapa el slug por si trae algo raro', () => {
    expect(enlaceDelReel('https://inmodf.com.ar', 'a b', 'abcdefgh')).toContain('/p/a%20b?')
  })
})

describe('enlacePersonalizadoConMarcas (Publicaciones, comentario personalizado)', () => {
  it('agrega las marcas de origen a una página cualquiera', () => {
    const url = new URL(enlacePersonalizadoConMarcas('https://inmobiliariadiegoferreyra.com/tasacion-directa', '1fb62134-abf6', 'instagram'))
    expect(url.origin + url.pathname).toBe('https://inmobiliariadiegoferreyra.com/tasacion-directa')
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    expect(url.searchParams.get('utm_medium')).toBe('reel')
    expect(url.searchParams.get('utm_campaign')).toBe('publicaciones')
    expect(url.searchParams.get('utm_content')).toBe('reel_1fb62134')
  })

  it('marca facebook cuando el comentario vino de Facebook', () => {
    const url = new URL(enlacePersonalizadoConMarcas('https://ejemplo.com/', 'abcdefgh-1', 'facebook'))
    expect(url.searchParams.get('utm_source')).toBe('facebook')
  })

  it('conserva los parámetros que ya tenía el enlace', () => {
    const url = new URL(enlacePersonalizadoConMarcas('https://ejemplo.com/x?ref=diego&a=1', 'abcdefgh', 'instagram'))
    expect(url.searchParams.get('ref')).toBe('diego')
    expect(url.searchParams.get('a')).toBe('1')
    expect(url.searchParams.get('utm_medium')).toBe('reel')
  })

  it('no pisa marcas que la persona ya puso a mano', () => {
    const url = new URL(enlacePersonalizadoConMarcas('https://ejemplo.com/?utm_campaign=tasacion_noviembre', 'abcdefgh', 'instagram'))
    expect(url.searchParams.get('utm_campaign')).toBe('tasacion_noviembre')
    expect(url.searchParams.get('utm_source')).toBe('instagram')
  })

  it('conserva el ancla del enlace', () => {
    expect(enlacePersonalizadoConMarcas('https://ejemplo.com/p#formulario', 'abcdefgh', 'instagram')).toMatch(/#formulario$/)
  })

  it('a un enlace de WhatsApp no le agrega nada (WhatsApp no lee esas marcas)', () => {
    const wa = 'https://wa.me/5491159109252?text=Hola%20Diego'
    expect(enlacePersonalizadoConMarcas(wa, 'abcdefgh', 'instagram')).toBe(wa)
    const api = 'https://api.whatsapp.com/send?phone=5491159109252'
    expect(enlacePersonalizadoConMarcas(api, 'abcdefgh', 'facebook')).toBe(api)
  })

  it('un host que solo se parece a WhatsApp sí lleva marcas', () => {
    expect(llevaMarcas('https://wa.me.ejemplo.com/x')).toBe(true)
    expect(llevaMarcas('https://wa.me/549')).toBe(false)
    expect(llevaMarcas('https://www.whatsapp.com/x')).toBe(false)
  })

  it('un texto que no es un enlace https se devuelve tal cual', () => {
    expect(enlacePersonalizadoConMarcas('no es un enlace', 'abcdefgh', 'instagram')).toBe('no es un enlace')
  })
})
