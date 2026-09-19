import { describe, it, expect } from 'vitest'
import { consultaCelda, filasDesdeRespuesta } from './overpass-celda'
import type { Celda } from './celdas'

const celda: Celda = { id: '-34.650_-58.450', sur: -34.65, oeste: -58.45, norte: -34.6, este: -58.4 }

// Forma REAL de la respuesta (relevada el 2026-09-19 sobre la celda más densa):
// 1) estaciones seguidas de sus rutas (foreach), 2) lugares con `center`,
// 3) rutas de colectivo con sus miembros (`out body`), 4) paradas sin tags (`out skel`),
// 5) tramos de esas rutas con su trazado (`out geom`).
const respuesta = {
  elements: [
    { type: 'node', id: 1, lat: -34.603, lon: -58.421, tags: { name: 'Medrano - Almagro', railway: 'station', station: 'subway' } },
    { type: 'relation', id: 11, tags: { route: 'subway', name: 'Línea B: Leandro N. Alem → Juan Manuel de Rosas', ref: 'B' } },
    { type: 'relation', id: 12, tags: { route: 'subway', name: 'Línea B: Juan Manuel de Rosas → Leandro N. Alem', ref: 'B' } },
    { type: 'node', id: 2, lat: -34.61, lon: -58.42, tags: { name: 'Once', railway: 'station', network: 'Sarmiento' } },
    { type: 'relation', id: 21, tags: { route: 'train', name: 'Línea Sarmiento: Once → Moreno' } },
    { type: 'relation', id: 22, tags: { route: 'subway', name: 'Línea H: Hospitales → Facultad de Derecho' } },
    { type: 'node', id: 3, lat: -34.64, lon: -58.44, tags: { name: 'Intendente Saguier', railway: 'station', station: 'subway' } },
    { type: 'relation', id: 31, tags: { route: 'tram', name: 'Premetro: Intendente Saguier → General Savio' } },
    { type: 'relation', id: 32, tags: { route: 'subway', name: 'Línea E: Retiro → Plaza de los Virreyes' } },
    { type: 'node', id: 12, lat: -34.6, lon: -58.43, tags: { name: 'Plaza del borde', leisure: 'park' } },
    // Plaza Constitución: los tags dicen subte, pero sus rutas son del Roca → tren, "Línea Roca".
    { type: 'node', id: 13, lat: -34.628, lon: -58.431, tags: { name: 'Plaza Constitución', railway: 'station', network: 'Subte;Trenes Argentinos' } },
    { type: 'relation', id: 131, tags: { route: 'train', name: 'Línea Roca - Vía Circuito: Constitución → Constitución' } },
    { type: 'relation', id: 132, tags: { route: 'train', name: 'Ferrocarril Roca - Rápido' } },
    { type: 'way', id: 5, center: { lat: -34.607, lon: -58.426 }, tags: { name: 'Hospital Italiano', amenity: 'hospital' } },
    { type: 'relation', id: 6, center: { lat: -34.604, lon: -58.42 }, tags: { name: 'Plaza Almagro', leisure: 'park' } },
    { type: 'node', id: 7, lat: -34.606, lon: -58.425, tags: { name: 'Escuela 11', amenity: 'school' } },
    { type: 'node', id: 8, lat: -34.5, lon: -58.425, tags: { name: 'Colegio afuera', amenity: 'school' } },
    { type: 'node', id: 9, lat: -34.606, lon: -58.425, tags: { amenity: 'school' } },
    { type: 'node', id: 10, lat: -34.606, lon: -58.425, tags: { amenity: 'school', name: `addr:city=X ${'x'.repeat(130)}` } },
    { type: 'node', id: 11, lat: 95, lon: -58.425, tags: { amenity: 'school', name: 'Coordenada imposible' } },
    { type: 'relation', id: 40, tags: { route: 'bus', ref: '24-1' }, members: [
      { type: 'node', ref: 100, role: 'platform' }, { type: 'way', ref: 900, role: '' }, { type: 'node', ref: 101, role: 'platform' },
    ] },
    { type: 'relation', id: 41, tags: { route: 'bus', ref: '160AG' }, members: [{ type: 'node', ref: 100, role: 'platform' }] },
    { type: 'relation', id: 42, tags: { route: 'bus', ref: '160GG' }, members: [{ type: 'node', ref: 100, role: 'platform' }] },
    { type: 'relation', id: 43, tags: { route: 'bus', ref: '19' }, members: [{ type: 'way', ref: 900, role: '' }, { type: 'way', ref: 901, role: '' }, { type: 'way', ref: 903, role: '' }] },
    { type: 'node', id: 100, lat: -34.605, lon: -58.424 },
    { type: 'node', id: 101, lat: -34.59, lon: -58.424 },
    { type: 'node', id: 102, lat: -34.606, lon: -58.423 },
    // Empieza en esta celda y sale al norte.
    { type: 'way', id: 900, nodes: [1, 2, 3], tags: { highway: 'primary', name: 'Av. Díaz Vélez' },
      geometry: [{ lat: -34.605, lon: -58.43 }, { lat: -34.601, lon: -58.43 }, { lat: -34.598, lon: -58.431 }] },
    // Pasa por la celda pero empieza en la de al lado: es de ESA celda (una fila, un dueño).
    { type: 'way', id: 901, nodes: [4, 5], tags: { highway: 'primary' },
      geometry: [{ lat: -34.59, lon: -58.44 }, { lat: -34.61, lon: -58.44 }] },
    // Un punto imposible en el trazado se saltea; el resto del tramo sirve.
    { type: 'way', id: 903, nodes: [8, 9, 10], tags: { highway: 'primary' },
      geometry: [{ lat: -34.62, lon: -58.43 }, { lat: 95, lon: -58.43 }, { lat: -34.621, lon: -58.43 }] },
    // No es de ninguna ruta de colectivo.
    { type: 'way', id: 902, nodes: [6, 7], tags: { highway: 'residential' },
      geometry: [{ lat: -34.62, lon: -58.42 }, { lat: -34.621, lon: -58.42 }] },
  ],
}

describe('filasDesdeRespuesta', () => {
  const filas = filasDesdeRespuesta(respuesta, celda)
  const por = (osm: string) => filas.find(f => f.osm_id === osm)

  it('guarda cada estación con TODAS sus líneas, sin repetir y en orden', () => {
    expect(por('n1')).toMatchObject({ tipo: 'subte', nombre: 'Medrano - Almagro', lineas: ['Línea B'], celda: celda.id })
    expect(por('n2')?.lineas).toEqual(['Línea H', 'Línea Sarmiento'])
  })

  it('una estación es subte si ALGUNA de sus rutas es subte (misma regla que el extractor de Python)', () => {
    // Once: tren Sarmiento + Línea H. Antes la primera ruta decidía ("tren") y
    // el refresco mensual cambiaba el tipo de lo cargado desde Geofabrik.
    expect(por('n2')?.tipo).toBe('subte')
    // Premetro: station=subway y la primera ruta es tram → sigue siendo subte.
    expect(por('n3')?.tipo).toBe('subte')
  })

  it('el tipo lo deciden las rutas: con rutas de tren y ninguna de subte es tren, aunque los tags digan subte', () => {
    expect(por('n13')).toMatchObject({ tipo: 'tren', lineas: ['Línea Roca'] })
  })

  it('una fila es de la celda que le toca por celdaDe, también en el borde', () => {
    // Justo sobre el borde norte de la celda: es de la celda de arriba (como en la carga desde el archivo).
    expect(por('n12')).toBeUndefined()
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

  it('deja afuera nombres basura (más de 120 caracteres) y coordenadas imposibles', () => {
    expect(por('n10')).toBeUndefined()
    expect(por('n11')).toBeUndefined()
  })

  it('arma las paradas con sus líneas de colectivo (sin ramales)', () => {
    expect(por('n100')).toMatchObject({ tipo: 'parada', lineas: ['24', '160'], lat: -34.605, lng: -58.424 })
  })

  it('no guarda paradas fuera de la celda ni paradas sin ninguna línea', () => {
    expect(por('n101')).toBeUndefined()
    expect(por('n102')).toBeUndefined()
  })

  it('guarda cada tramo de recorrido con su trazado y TODAS las líneas que pasan por él', () => {
    expect(por('w900')).toMatchObject({
      tipo: 'recorrido', nombre: '', lineas: ['19', '24'], lat: -34.605, lng: -58.43, celda: celda.id,
      trazo: [[-58.43, -34.605], [-58.43, -34.601], [-58.431, -34.598]],
    })
  })

  it('saltea los puntos imposibles del trazado', () => {
    expect(por('w903')?.trazo).toEqual([[-58.43, -34.62], [-58.43, -34.621]])
  })

  it('un tramo es de la celda donde empieza (su primer punto dentro del AMBA), aunque pase por otras', () => {
    expect(por('w901')).toBeUndefined()
    expect(filasDesdeRespuesta(respuesta, { id: '-34.600_-58.450', sur: -34.6, oeste: -58.45, norte: -34.55, este: -58.4 })
      .find(f => f.osm_id === 'w901')).toMatchObject({ tipo: 'recorrido', lineas: ['19'] })
  })

  it('no guarda tramos que no son de ninguna ruta de colectivo ni tramos de un solo punto', () => {
    expect(por('w902')).toBeUndefined()
    const unPunto = { elements: [
      { type: 'relation', id: 1, tags: { route: 'bus', ref: '5' }, members: [{ type: 'way', ref: 7, role: '' }] },
      { type: 'way', id: 7, nodes: [1], geometry: [{ lat: -34.62, lon: -58.42 }] },
    ] }
    expect(filasDesdeRespuesta(unPunto, celda)).toEqual([])
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
    // Los tramos de las rutas con su trazado: "pasa a 400 m" aunque falten paradas.
    expect(q).toMatch(/way\(r\.rutasCelda\)/)
    expect(q).toContain('out geom')
    // Preguntar parada por parada tardaba 94 s en la celda más densa.
    expect(q).not.toMatch(/foreach\.paradas/)
  })
})
