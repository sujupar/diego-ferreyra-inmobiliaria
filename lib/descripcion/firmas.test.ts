import { describe, it, expect } from 'vitest'
import { firmaFotos, firmaZona } from './firmas'

describe('firmaFotos', () => {
  it('es la misma para el mismo array', () => {
    expect(firmaFotos(['a', 'b'])).toBe(firmaFotos(['a', 'b']))
  })
  it('cambia si cambia el orden (la portada importa)', () => {
    expect(firmaFotos(['a', 'b'])).not.toBe(firmaFotos(['b', 'a']))
  })
  it('cambia si cambia una URL', () => {
    expect(firmaFotos(['a', 'b'])).not.toBe(firmaFotos(['a', 'c']))
  })
  it('no confunde ["ab"] con ["a","b"]', () => {
    expect(firmaFotos(['ab'])).not.toBe(firmaFotos(['a', 'b']))
  })
  it('es estable con array vacío', () => {
    expect(firmaFotos([])).toBe(firmaFotos([]))
  })
})

describe('firmaZona', () => {
  const pin = { lat: -34.6039, lng: -58.4201 }
  it('ignora mayúsculas, espacios de más y la forma de la tilde', () => {
    const nfd = 'Díaz Colodrero 2327'
    expect(firmaZona({ address: 'Díaz Colodrero 2327', neighborhood: 'Villa Urquiza', city: 'CABA' }, pin))
      .toBe(firmaZona({ address: `  ${nfd.toLowerCase()}  `, neighborhood: 'villa  urquiza', city: 'caba' }, pin))
  })
  it('cambia si cambia el barrio', () => {
    expect(firmaZona({ address: 'X 1', neighborhood: 'Almagro' }, pin))
      .not.toBe(firmaZona({ address: 'X 1', neighborhood: 'Boedo' }, pin))
  })
  it('cambia si se corrige el pin aunque la dirección sea la misma (el mapa es otro)', () => {
    // Almafuerte 2500 (San Martín) tenía el pin en Junín: corregirlo tiene que rehacer la zona.
    expect(firmaZona({ address: 'Almafuerte 2500' }, { lat: -34.5836, lng: -60.9604 }))
      .not.toBe(firmaZona({ address: 'Almafuerte 2500' }, { lat: -34.5712, lng: -58.5391 }))
  })
  it('no cambia por ruido de coma flotante por debajo del metro', () => {
    expect(firmaZona({ address: 'X 1' }, { lat: -34.6039, lng: -58.4201 }))
      .toBe(firmaZona({ address: 'X 1' }, { lat: -34.603900000001, lng: -58.420099999999 }))
  })
})
