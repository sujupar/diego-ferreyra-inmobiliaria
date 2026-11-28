import { describe, it, expect } from 'vitest'
import { parsearClasificacion, promptClasificacion, entradaClasificacion } from './clasificar'
import type { ReelCrudo, CuentaPerfil } from '../tipos'

const reel: ReelCrudo = {
  shortcode: 'abc', pk: '1', cuenta: 'inmo_ar', publicadoAt: '2026-11-01T00:00:00Z',
  vistas: 1000, likes: 10, comentarios: 2, caption: 'Baja el impuesto de sellos',
  duracionSeg: 30, urlPortada: null, esReel: true,
}
const perfil: CuentaPerfil = { usuario: 'inmo_ar', igUserId: '9', seguidores: 12345 }

describe('parsearClasificacion', () => {
  it('acepta un JSON válido', () => {
    const r = parsearClasificacion('{"categoria":"inmobiliario_ar","tema":"impuestos","puntaje":8,"razon":"sirve"}')
    expect(r).toEqual({ categoria: 'inmobiliario_ar', tema: 'impuestos', puntaje: 8, razon: 'sirve' })
  })
  it('tira ante texto no JSON', () => {
    expect(() => parsearClasificacion('hola')).toThrow()
  })
  it('tira ante categoría fuera del enum', () => {
    expect(() => parsearClasificacion('{"categoria":"x","tema":"otro","puntaje":5,"razon":"r"}')).toThrow()
  })
  it('redondea el puntaje a entero (la columna es smallint)', () => {
    expect(parsearClasificacion('{"categoria":"inmobiliario_ar","tema":"otro","puntaje":7.5,"razon":"r"}').puntaje).toBe(8)
    expect(parsearClasificacion('{"categoria":"inmobiliario_ar","tema":"otro","puntaje":6.2,"razon":"r"}').puntaje).toBe(6)
  })
  it('tira ante puntaje fuera de 0–10', () => {
    expect(() => parsearClasificacion('{"categoria":"no_sirve","tema":"otro","puntaje":11,"razon":"r"}')).toThrow()
    expect(() => parsearClasificacion('{"categoria":"no_sirve","tema":"otro","puntaje":-1,"razon":"r"}')).toThrow()
  })
})

describe('promptClasificacion', () => {
  it('incluye los ejemplos que el equipo marcó como no sirve', () => {
    expect(promptClasificacion(['glow up de pelo'])).toContain('glow up de pelo')
  })
})

describe('entradaClasificacion', () => {
  it('incluye caption, cuenta, seguidores y hasta 10 comentarios', () => {
    const com = Array.from({ length: 15 }, (_, i) => `comentario-${i}-x`)
    const t = entradaClasificacion(reel, perfil, com)
    expect(t).toContain('Baja el impuesto de sellos')
    expect(t).toContain('inmo_ar')
    expect(t).toContain('12345')
    expect(t).toContain('comentario-9-x')
    expect(t).not.toContain('comentario-10-x')
  })
})
