import { describe, it, expect } from 'vitest'
import { consultaCelda, filasDesdeRespuesta } from './overpass-celda'
import type { Celda } from './celdas'

const celda: Celda = { id: '-34.650_-58.450', sur: -34.65, oeste: -58.45, norte: -34.6, este: -58.4 }

// Forma REAL de la respuesta (relevada el 2026-09-19 sobre la celda más densa):
// 1) estaciones seguidas de sus rutas (foreach), 2) lugares con `center`,
// 3) rutas de colectivo con sus miembros (`out body`), 4) paradas sin tags (`out skel`).
const respuesta = {
  elements: [
    { type: 'node', id: 1, lat: -34.603, lon: -58.421, tags: { name: 'Medrano - Almagro', railway: 'station', station: 'subway' } },
    { type: 'relation', id: 11, tags: { route: 'subway', name: 'Línea B: Leandro N. Alem → Juan Manuel de Rosas', ref: 'B' } },
    { type: 'relation', id: 12, tags: { route: 'subway', name: 'Línea B: Juan Manuel de Rosas → Leandro N. Alem', ref: 'B' } },
    { type: 'node', id: 2, lat: -34.61, lon: -58.42, tags: { name: 'Once', railway: 'station', network: 'Sarmiento' } },
    { type: 'relation', id: 21, tags: { route: 'train', name: 'Línea Sarmiento: Once → Moreno' } },
    { type: 'relation', id: 22, tags: { route: 'subway', name: 'Línea H: Hospitales → Facultad de Derecho' } },
    { type: 'way', id: 5, center: { lat: -34.607, lon: -58.426 }, tags: { name: 'Hospital Italiano', amenity: 'hospital' } },
    { type: 'relation', id: 6, center: { lat: -34.604, lon: -58.42 }, tags: { name: 'Plaza Almagro', leisure: 'park' } },
    { type: 'node', id: 7, lat: -34.606, lon: -58.425, tags: { name: 'Escuela 11', amenity: 'school' } },
    { type: 'node', id: 8, lat: -34.5, lon: -58.425, tags: { name: 'Colegio afuera', amenity: 'school' } },
    { type: 'node', id: 9, lat: -34.606, lon: -58.425, tags: { amenity: 'school' } },
    { type: 'relation', id: 40, tags: { route: 'bus', ref: '24-1' }, members: [
      { type: 'node', ref: 100, role: 'platform' }, { type: 'way', ref: 900, role: '' }, { type: 'node', ref: 101, role: 'platform' },
    ] },
    { type: 'relation', id: 41, tags: { route: 'bus', ref: '160AG' }, members: [{ type: 'node', ref: 100, role: 'platform' }] },
    { type: 'relation', id: 42, tags: { route: 'bus', ref: '160GG' }, members: [{ type: 'node', ref: 100, role: 'platform' }] },
    { type: 'node', id: 100, lat: -34.605, lon: -58.424 },
    { type: 'node', id: 101, lat: -34.59, lon: -58.424 },
    { type: 'node', id: 102, lat: -34.606, lon: -58.423 },
  ],
}

describe('filasDesdeRespuesta', () => {
  const filas = filasDesdeRespuesta(respuesta, celda)
  const por = (osm: string) => filas.find(f => f.osm_id === osm)

  it('guarda cada estación con TODAS sus líneas, sin repetir', () => {
    expect(por('n1')).toMatchObject({ tipo: 'subte', nombre: 'Medrano - Almagro', lineas: ['Línea B'], celda: celda.id })
    expect(por('n2')).toMatchObject({ tipo: 'tren', lineas: ['Línea Sarmiento', 'Línea H'] })
  })

  it('guarda plazas, colegios y hospitales con su centro, marcando si son way o relation', () => {
    expect(por('w5')).toMatchObject({ tipo: 'hospital', nombre: 'Hospital Italiano', lat: -34.607, lng: -58.426 })
    expect(por('r6')).toMatchObject({ tipo: 'plaza', nombre: 'Plaza Almagro' })
    expect(por('n7')).toMatchObject({ tipo: 'colegio' })
  })

  it('deja afuera lo que no tiene nombre y lo que cae fuera de la celda', () => {
    expect(por('n8')).toBeUndefined()
    expect(por('n9')).toBeUndefined()
  })

  it('arma las paradas con sus líneas de colectivo (sin ramales)', () => {
    expect(por('n100')).toMatchObject({ tipo: 'parada', lineas: ['24', '160'], lat: -34.605, lng: -58.424 })
  })

  it('no guarda paradas fuera de la celda ni paradas sin ninguna línea', () => {
    expect(por('n101')).toBeUndefined()
    expect(por('n102')).toBeUndefined()
  })

  it('las rutas de colectivo no se pegan como línea de una estación', () => {
    expect(por('n2')?.lineas).not.toContain('24')
  })

  it('con basura devuelve una lista vacía', () => {
    expect(filasDesdeRespuesta(null, celda)).toEqual([])
    expect(filasDesdeRespuesta({ elements: 'x' }, celda)).toEqual([])
  })
})

describe('consultaCelda', () => {
  it('pide todo con la caja de la celda y las rutas con sus miembros (no parada por parada)', () => {
    const q = consultaCelda(celda)
    expect(q).toContain('(-34.65,-58.45,-34.6,-58.4)')
    expect(q).toContain('[railway=station]')
    expect(q).toContain('rel(bn.paradas)[route=bus]')
    expect(q).toContain('out body')
    expect(q).toContain('out skel')
    // Preguntar parada por parada tardaba 94 s en la celda más densa.
    expect(q).not.toMatch(/foreach\.paradas/)
  })
})
