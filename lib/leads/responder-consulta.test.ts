import { describe, it, expect } from 'vitest'
import { ubicacionDeLaPropiedad } from './responder-consulta'

/**
 * Cómo se nombra la propiedad en el mensaje que recibe el cliente.
 *
 * El 6 de agosto de 2026 llegó un WhatsApp que decía "la casa de Entre Ríos
 * 2333, Martínez, San Isidro, Martínez": muchas direcciones ya vienen cargadas
 * completas y el código les pegaba el barrio otra vez al final.
 */
describe('ubicacionDeLaPropiedad', () => {
  it('no repite el barrio si la dirección ya lo incluye', () => {
    expect(ubicacionDeLaPropiedad({
      address: 'Entre Ríos 2333, Martínez, San Isidro',
      neighborhood: 'Martínez',
    })).toBe('Entre Ríos 2333, Martínez, San Isidro')
  })

  it('ignora los acentos al comparar', () => {
    // En la base conviven "Martinez" y "Martínez" para el mismo lugar.
    expect(ubicacionDeLaPropiedad({
      address: 'Entre Ríos 2333, Martínez, San Isidro',
      neighborhood: 'Martinez',
    })).toBe('Entre Ríos 2333, Martínez, San Isidro')
  })

  it('ignora las mayúsculas al comparar', () => {
    expect(ubicacionDeLaPropiedad({
      address: 'Güemes 300, PALERMO',
      neighborhood: 'Palermo',
    })).toBe('Güemes 300, PALERMO')
  })

  it('agrega el barrio cuando la dirección es solo la calle', () => {
    expect(ubicacionDeLaPropiedad({ address: 'Güemes 300', neighborhood: 'Palermo' }))
      .toBe('Güemes 300, Palermo')
  })

  it('funciona con uno solo de los dos datos', () => {
    expect(ubicacionDeLaPropiedad({ address: 'Güemes 300', neighborhood: null })).toBe('Güemes 300')
    expect(ubicacionDeLaPropiedad({ address: null, neighborhood: 'Palermo' })).toBe('Palermo')
    expect(ubicacionDeLaPropiedad({ address: '  ', neighborhood: '  ' })).toBe('')
  })

  it('sin ningún dato devuelve vacío, no la palabra "null"', () => {
    expect(ubicacionDeLaPropiedad({})).toBe('')
  })
})
