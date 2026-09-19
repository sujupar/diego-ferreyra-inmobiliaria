import { describe, it, expect } from 'vitest'
import { lineaDeRuta, lineaDeColectivo, ordenarLineasColectivo, nombreUtil } from './normalizar'

describe('nombreUtil', () => {
  it('limpia caracteres de control y espacios de los bordes', () => {
    expect(nombreUtil(`  Plaza Almagro${String.fromCharCode(0)} `)).toBe('Plaza Almagro')
  })
  it('descarta lo que no es un nombre citable: vacío, no texto, o más de 120 caracteres', () => {
    expect(nombreUtil('   ')).toBeNull()
    expect(nombreUtil(undefined)).toBeNull()
    expect(nombreUtil(42)).toBeNull()
    // Real (OpenStreetMap, González Catán): los tags pegados en el nombre.
    expect(nombreUtil('addr:city=González Catan addr:housenumber=6067 addr:postcode=1759 addr:street=Enrique Simón Pérez building=school name=Instituto González Catán - Jardín Monigote')).toBeNull()
  })
  it('una ruta con nombre basura no da nombre de línea', () => {
    expect(lineaDeRuta({ name: 'x'.repeat(130) })).toBeUndefined()
  })
})

describe('lineaDeRuta (subte y tren)', () => {
  it('toma el nombre antes de los dos puntos', () => {
    expect(lineaDeRuta({ name: 'Línea B: Leandro N. Alem → Juan Manuel de Rosas', ref: 'B' })).toBe('Línea B')
    expect(lineaDeRuta({ name: 'Línea Mitre: Retiro → José León Suárez' })).toBe('Línea Mitre')
  })
  it('une las variantes de una misma línea de tren (ramal y "Ferrocarril")', () => {
    expect(lineaDeRuta({ name: 'Línea Roca - Vía Circuito: Constitución → Constitución' })).toBe('Línea Roca')
    expect(lineaDeRuta({ name: 'Ferrocarril Roca - Rápido' })).toBe('Línea Roca')
    expect(lineaDeRuta({ name: 'Ferrocarril San Martín: Retiro → Pilar' })).toBe('Línea San Martín')
    expect(lineaDeRuta({ name: 'Tren Universitario: La Plata → Policlínico' })).toBe('Tren Universitario')
  })
  it('sin nombre usa la referencia', () => {
    expect(lineaDeRuta({ ref: 'A' })).toBe('Línea A')
    expect(lineaDeRuta({})).toBeUndefined()
  })
})

describe('lineaDeColectivo', () => {
  it('saca el ramal de la referencia', () => {
    expect(lineaDeColectivo({ ref: '24-1' })).toBe('24')
    expect(lineaDeColectivo({ ref: '160AG' })).toBe('160')
    expect(lineaDeColectivo({ ref: '007' })).toBe('7')
  })
  it('sin referencia la saca del nombre', () => {
    expect(lineaDeColectivo({ name: 'Línea 105: Plaza del Correo → Caseros' })).toBe('105')
  })
  it('sin nada devuelve undefined', () => {
    expect(lineaDeColectivo({ name: 'Servicio especial' })).toBeUndefined()
  })
})

describe('ordenarLineasColectivo', () => {
  it('sin repetir y en orden numérico', () => {
    expect(ordenarLineasColectivo(['160', '19', '24', '19', '105'])).toEqual(['19', '24', '105', '160'])
  })
})
