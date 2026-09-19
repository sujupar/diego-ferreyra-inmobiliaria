import { describe, it, expect } from 'vitest'
import { faltanParaGenerar, MIN_FOTOS } from './requisitos'

const fotos = (n: number) => Array.from({ length: n }, (_, i) => `https://x/f${i}.jpg`)
const completa = {
  photos: fotos(22), property_type: 'departamento', address: 'Perón 4227',
  neighborhood: 'Almagro', rooms: 3, covered_area: 42, asking_price: 80000,
}

describe('faltanParaGenerar', () => {
  it('con todo cargado no falta nada', () => {
    expect(faltanParaGenerar(completa)).toEqual([])
  })
  it('con menos fotos que el mínimo dice cuántas tiene', () => {
    expect(MIN_FOTOS).toBe(5)
    expect(faltanParaGenerar({ ...completa, photos: fotos(4) })).toEqual(['fotos (tiene 4, mínimo 5)'])
  })
  it('sin fotos cuenta cero', () => {
    expect(faltanParaGenerar({ ...completa, photos: null })).toEqual(['fotos (tiene 0, mínimo 5)'])
  })
  it('precio cero o ausente es precio faltante', () => {
    expect(faltanParaGenerar({ ...completa, asking_price: 0 })).toEqual(['precio'])
    expect(faltanParaGenerar({ ...completa, asking_price: null })).toEqual(['precio'])
  })
  it('una dirección de solo espacios no cuenta', () => {
    expect(faltanParaGenerar({ ...completa, address: '   ' })).toEqual(['dirección'])
  })
  it('un terreno pide la superficie del lote, no ambientes ni superficie cubierta', () => {
    const terreno = {
      photos: fotos(8), property_type: 'terreno', address: 'Ruta Provincial 52', neighborhood: 'Tristán Suárez',
      rooms: null, covered_area: null, total_area: 600, asking_price: 28700,
    }
    expect(faltanParaGenerar(terreno)).toEqual([])
    expect(faltanParaGenerar({ ...terreno, total_area: null })).toEqual(['superficie del lote'])
  })
  it('reconoce el tipo sin importar mayúsculas ni espacios', () => {
    expect(faltanParaGenerar({ ...completa, property_type: ' Terreno ', rooms: null, covered_area: null, total_area: 300 })).toEqual([])
  })

  it('lista todo lo que falta, en orden', () => {
    expect(faltanParaGenerar({})).toEqual([
      'fotos (tiene 0, mínimo 5)', 'tipo de propiedad', 'dirección', 'barrio',
      'ambientes', 'superficie cubierta', 'precio',
    ])
  })
})
