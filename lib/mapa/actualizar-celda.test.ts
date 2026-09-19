import { describe, it, expect } from 'vitest'
import { ubicacionWkt, descargaSospechosa } from './actualizar-celda'
import type { FilaMapa } from './overpass-celda'

const base: FilaMapa = { osm_id: 'n1', tipo: 'parada', nombre: '', lineas: ['24'], lat: -34.605, lng: -58.424, celda: '-34.650_-58.450' }

describe('ubicacionWkt', () => {
  it('un lugar o una parada es un punto, en orden lng lat', () => {
    expect(ubicacionWkt(base)).toBe('SRID=4326;POINT(-58.424 -34.605)')
  })

  it('un recorrido es su trazado completo: la distancia se mide a la calle por donde pasa', () => {
    const tramo: FilaMapa = { ...base, osm_id: 'w900', tipo: 'recorrido', trazo: [[-58.43, -34.605], [-58.43, -34.601], [-58.431, -34.598]] }
    expect(ubicacionWkt(tramo)).toBe('SRID=4326;LINESTRING(-58.43 -34.605,-58.43 -34.601,-58.431 -34.598)')
  })

  it('un recorrido sin trazado válido no se puede guardar (lanza, no inventa un punto)', () => {
    expect(() => ubicacionWkt({ ...base, tipo: 'recorrido' })).toThrow()
    expect(() => ubicacionWkt({ ...base, tipo: 'recorrido', trazo: [[-58.43, -34.605]] })).toThrow()
  })
})

describe('descargaSospechosa', () => {
  it('una descarga "buena" con mucho menos que lo que había es sospechosa (espejo vacío o recortado)', () => {
    expect(descargaSospechosa(3145, 0)).toBe(true)
    expect(descargaSospechosa(3145, 1500)).toBe(true)
  })
  it('cambios normales de un mes pasan', () => {
    expect(descargaSospechosa(3145, 3100)).toBe(false)
    expect(descargaSospechosa(3145, 3300)).toBe(false)
  })
  it('una celda casi vacía (campo, río) puede quedar vacía: no hay de dónde sospechar', () => {
    expect(descargaSospechosa(5, 0)).toBe(false)
    expect(descargaSospechosa(0, 0)).toBe(false)
  })
})
