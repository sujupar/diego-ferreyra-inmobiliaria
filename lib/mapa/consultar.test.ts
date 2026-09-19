import { describe, it, expect } from 'vitest'
import { resultadoDesdeFilas, hayCobertura } from './consultar'

const filas = [
  { osm_id: 'n1', tipo: 'subte', nombre: 'Medrano - Almagro', lineas: ['Línea B'], metros: 600 },
  { osm_id: 'n2', tipo: 'tren', nombre: 'Once', lineas: ['Línea Sarmiento', 'Línea H'], metros: 1200 },
  { osm_id: 'w5', tipo: 'hospital', nombre: 'Hospital Italiano de Buenos Aires', lineas: [], metros: 91 },
  { osm_id: 'n7', tipo: 'colegio', nombre: 'Escuela Primaria Común 11', lineas: [], metros: 278 },
  { osm_id: 'n8', tipo: 'colegio', nombre: 'Escuela Primaria p/Adultos 23', lineas: [], metros: 279 },
  { osm_id: 'n100', tipo: 'parada', nombre: '', lineas: ['24', '160'], metros: 120 },
  { osm_id: 'n101', tipo: 'parada', nombre: '', lineas: ['19', '24'], metros: 300 },
]

describe('resultadoDesdeFilas', () => {
  const r = resultadoDesdeFilas(filas)

  it('arma los lugares con cuadras y la línea de cada estación', () => {
    expect(r.lugares.find(l => l.nombre === 'Medrano - Almagro')).toEqual({ nombre: 'Medrano - Almagro', tipo: 'subte', linea: 'Línea B', metros: 600, cuadras: 6 })
    expect(r.lugares.find(l => l.nombre === 'Once')?.linea).toBe('Línea Sarmiento y Línea H')
    expect(r.lugares.find(l => l.tipo === 'hospital')?.cuadras).toBe(1)
  })

  it('aplica la misma selección que el mapa en vivo (sin colegios para adultos, ordenado)', () => {
    expect(r.lugares.map(l => l.nombre)).not.toContain('Escuela Primaria p/Adultos 23')
    const metros = r.lugares.map(l => l.metros)
    expect(metros).toEqual([...metros].sort((a, b) => a - b))
  })

  it('junta los colectivos de todas las paradas cercanas, sin repetir y en orden', () => {
    expect(r.colectivos).toEqual(['19', '24', '160'])
  })

  it('las paradas no aparecen como lugares', () => {
    expect(r.lugares.some(l => (l.tipo as string) === 'parada')).toBe(false)
  })

  it('sin filas: sin lugares ni colectivos (lugar sin nada cerca, no es un error)', () => {
    expect(resultadoDesdeFilas([])).toEqual({ lugares: [], colectivos: [] })
  })
})

describe('hayCobertura', () => {
  const ok = { id: 'a', actualizado_en: '2026-09-19T00:00:00Z' }
  it('todas las celdas pedidas con una descarga buena → sí', () => {
    expect(hayCobertura(['a', 'b'], [ok, { id: 'b', actualizado_en: '2026-09-19T00:00:00Z' }])).toBe(true)
  })
  it('una celda que nunca bajó bien → no (se consulta en vivo, no se escribe "sin lugares")', () => {
    expect(hayCobertura(['a', 'b'], [ok, { id: 'b', actualizado_en: null }])).toBe(false)
    expect(hayCobertura(['a', 'b'], [ok])).toBe(false)
  })
  it('sin celdas pedidas (fuera del AMBA) → no', () => {
    expect(hayCobertura([], [])).toBe(false)
  })
})
