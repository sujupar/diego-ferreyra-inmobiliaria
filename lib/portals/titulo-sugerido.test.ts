import { describe, it, expect } from 'vitest'
import { tituloSugerido } from './titulo-sugerido'

describe('tituloSugerido', () => {
  it('con título propio lo devuelve recortado al máximo del portal', () => {
    expect(tituloSugerido({ title: 'x'.repeat(100) }, { max: 60 })).toHaveLength(60)
    expect(tituloSugerido({ title: 'Lindo 3 amb' }, { max: 80 })).toBe('Lindo 3 amb')
  })

  it('un título vacío o de espacios cuenta como ausente (es lo que mostraba el paso Descripción en blanco)', () => {
    expect(tituloSugerido({ title: '   ', property_type: 'departamento', rooms: 2, neighborhood: 'Monserrat' }, { max: 60 }))
      .toBe('Departamento 2 amb Monserrat')
    expect(tituloSugerido({ title: null, property_type: 'departamento', rooms: 2, neighborhood: 'Monserrat' }, { max: 60 }))
      .toBe('Departamento 2 amb Monserrat')
  })

  it('estilo Argenprop: con "en" antes del barrio', () => {
    expect(tituloSugerido({ property_type: 'casa', rooms: 4, neighborhood: 'Devoto' }, { max: 80, conjuncion: true }))
      .toBe('Casa 4 amb en Devoto')
  })

  it('sin ambientes ni barrio no deja espacios sueltos', () => {
    expect(tituloSugerido({ property_type: 'ph', rooms: null, neighborhood: '' }, { max: 60 })).toBe('Ph')
  })

  it('sin tipo usa el tipo por defecto que pide el portal', () => {
    expect(tituloSugerido({ property_type: null, rooms: 2, neighborhood: 'Flores' }, { max: 60 })).toBe('Departamento 2 amb Flores')
    expect(tituloSugerido({ property_type: null, rooms: 2, neighborhood: 'Flores' }, { max: 80, conjuncion: true, tipoPorDefecto: 'Propiedad' }))
      .toBe('Propiedad 2 amb en Flores')
  })
})
