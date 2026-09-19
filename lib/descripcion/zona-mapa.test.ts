import { describe, it, expect } from 'vitest'
import { distanciaMetros, lugaresDesdeOverpass, consultaOverpass, lineasATexto } from './zona-mapa'

// Perón 4227 (Almagro), geocodificada por Nominatim el 2026-09-19.
const ORIGEN = { lat: -34.6058567, lng: -58.4265171 }

// Respuesta de Overpass con la forma REAL relevada ese día: cada estación
// seguida de sus relaciones de ruta (el `foreach` las devuelve en ese orden),
// después los lugares con `center`.
const respuesta = {
  elements: [
    { type: 'node', id: 1, lat: -34.6032, lon: -58.4210, tags: { name: 'Medrano - Almagro', railway: 'station', station: 'subway', network: 'Subte de Buenos Aires' } },
    { type: 'relation', id: 11, tags: { route: 'subway', name: 'Línea B: Leandro N. Alem → Juan Manuel de Rosas', ref: 'B' } },
    { type: 'relation', id: 12, tags: { route: 'subway', name: 'Línea B: Juan Manuel de Rosas → Leandro N. Alem', ref: 'B' } },
    { type: 'node', id: 2, lat: -34.6095, lon: -58.4200, tags: { name: 'Castro Barros', railway: 'station', station: 'subway' } },
    { type: 'relation', id: 21, tags: { route: 'subway', name: 'Línea A: Plaza de Mayo → San Pedrito', ref: 'A' } },
    { type: 'node', id: 3, lat: -34.5745, lon: -58.4865, tags: { name: 'General Urquiza', railway: 'station', network: 'Mitre' } },
    { type: 'relation', id: 31, tags: { route: 'train', name: 'Línea Mitre: José León Suárez → Retiro', ref: 'LM' } },
    { type: 'node', id: 4, lat: -34.5990, lon: -58.4300, tags: { name: 'Estación sin rutas', railway: 'station', station: 'subway' } },
    { type: 'way', id: 5, center: { lat: -34.6066, lon: -58.4262 }, tags: { name: 'Hospital Italiano de Buenos Aires', amenity: 'hospital' } },
    { type: 'way', id: 6, center: { lat: -34.6040, lon: -58.4200 }, tags: { name: 'Plaza Almagro', leisure: 'park' } },
    { type: 'way', id: 7, center: { lat: -34.6041, lon: -58.4201 }, tags: { name: 'Plaza Almagro', leisure: 'park' } },
    { type: 'node', id: 8, lat: -34.6070, lon: -58.4250, tags: { name: 'Escuela Primaria Común 11 Provincia de Jujuy', amenity: 'school' } },
    { type: 'node', id: 9, lat: -34.6071, lon: -58.4251, tags: { name: 'Escuela Primaria p/Adultos 23 Gral. Belgrano', amenity: 'school' } },
    { type: 'node', id: 10, lat: -34.6080, lon: -58.4240, tags: { name: 'Centro de Formación Profesional 29', amenity: 'school' } },
    { type: 'node', id: 13, lat: -34.6000, lon: -58.4300, tags: { name: 'CBC - Sede 7 - Doctor Ramos Mejía', amenity: 'university' } },
    { type: 'node', id: 14, lat: -34.6001, lon: -58.4301, tags: { amenity: 'school' } },
  ],
}

describe('distanciaMetros', () => {
  it('calcula una distancia conocida con error menor al 1 %', () => {
    // Obelisco → Congreso: ~1.186 m en línea recta (cálculo de referencia a mano).
    const d = distanciaMetros({ lat: -34.6037, lng: -58.3816 }, { lat: -34.6096, lng: -58.3924 })
    expect(d).toBeGreaterThan(1150)
    expect(d).toBeLessThan(1200)
  })
  it('da cero para el mismo punto', () => {
    expect(distanciaMetros(ORIGEN, ORIGEN)).toBe(0)
  })
})

describe('lugaresDesdeOverpass', () => {
  const lugares = lugaresDesdeOverpass(respuesta, ORIGEN)

  it('asigna la línea desde la relación de ruta que sigue a la estación', () => {
    const medrano = lugares.find(l => l.nombre === 'Medrano - Almagro')
    expect(medrano).toMatchObject({ tipo: 'subte', linea: 'Línea B' })
    expect(lugares.find(l => l.nombre === 'Castro Barros')).toMatchObject({ tipo: 'subte', linea: 'Línea A' })
  })
  it('una estación de tren queda como tren con su línea', () => {
    expect(lugares.find(l => l.nombre === 'General Urquiza')).toMatchObject({ tipo: 'tren', linea: 'Línea Mitre' })
  })
  it('una estación sin rutas conocidas queda sin línea', () => {
    expect(lugares.find(l => l.nombre === 'Estación sin rutas')?.linea).toBeUndefined()
  })
  it('calcula metros y cuadras', () => {
    const hospital = lugares.find(l => l.tipo === 'hospital')
    expect(hospital?.nombre).toBe('Hospital Italiano de Buenos Aires')
    expect(hospital?.metros).toBeLessThan(150)
    expect(hospital?.cuadras).toBe(1)
  })
  it('deduplica por nombre quedándose con el más cercano', () => {
    expect(lugares.filter(l => l.nombre === 'Plaza Almagro')).toHaveLength(1)
  })
  it('descarta escuelas para adultos, formación profesional y sin nombre', () => {
    const colegios = lugares.filter(l => l.tipo === 'colegio').map(l => l.nombre)
    expect(colegios).toEqual(['Escuela Primaria Común 11 Provincia de Jujuy'])
  })
  it('clasifica universidades aparte', () => {
    expect(lugares.find(l => l.tipo === 'universidad')?.nombre).toBe('CBC - Sede 7 - Doctor Ramos Mejía')
  })
  it('ordena por distancia', () => {
    const metros = lugares.map(l => l.metros)
    expect(metros).toEqual([...metros].sort((a, b) => a - b))
  })
  it('respeta el tope por tipo', () => {
    const muchas = {
      elements: Array.from({ length: 10 }, (_, i) => ({
        type: 'node', id: 100 + i, lat: -34.6058 + i * 0.0005, lon: -58.4265,
        tags: { name: `Escuela ${i}`, amenity: 'school' },
      })),
    }
    expect(lugaresDesdeOverpass(muchas, ORIGEN)).toHaveLength(4)
  })
  it('con basura devuelve una lista vacía', () => {
    expect(lugaresDesdeOverpass(null, ORIGEN)).toEqual([])
    expect(lugaresDesdeOverpass({ elements: 'x' }, ORIGEN)).toEqual([])
  })
})

describe('consultaOverpass', () => {
  it('pide estaciones con sus rutas y los lugares alrededor del punto', () => {
    const q = consultaOverpass(-34.6, -58.4)
    expect(q).toContain('around:1500,-34.6,-58.4')
    expect(q).toContain('[railway=station]')
    expect(q).toContain('foreach')
    expect(q).toContain('[leisure=park]')
    expect(q).toContain('amenity=hospital')
  })
})

describe('lineasATexto', () => {
  it('dice "a 1 cuadra" en singular', () => {
    expect(lineasATexto([{ nombre: 'Hospital Italiano', tipo: 'hospital', metros: 91, cuadras: 1 }]))
      .toBe('- Hospital: Hospital Italiano: 91 m (a 1 cuadra)')
  })
  it('arma una línea por lugar, con cuadras', () => {
    const texto = lineasATexto([
      { nombre: 'Medrano - Almagro', tipo: 'subte', linea: 'Línea B', metros: 600, cuadras: 6 },
      { nombre: 'Plaza Almagro', tipo: 'plaza', metros: 681, cuadras: 7 },
    ])
    expect(texto).toBe([
      '- Subte Línea B – Estación Medrano - Almagro: 600 m (a unas 6 cuadras)',
      '- Plaza/parque: Plaza Almagro: 681 m (a unas 7 cuadras)',
    ].join('\n'))
  })
})
