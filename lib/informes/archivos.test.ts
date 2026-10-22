import { describe, it, expect } from 'vitest'
import { validarCaptura, pathDeCaptura, esPathDeCaptura, pathDelPdf, esPathDelPdf, esPdf, esImagen, nombreDelPdf } from './archivos'

const ID = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'

describe('capturas', () => {
  it('solo imágenes de hasta 5 MB', () => {
    expect(validarCaptura({ nombre: 'zp.PNG', bytes: 100 })).toBeNull()
    expect(validarCaptura({ nombre: 'zp.gif', bytes: 100 })).toBe('La captura tiene que ser PNG, JPG o WEBP')
    expect(validarCaptura({ nombre: 'zp.png', bytes: 6 * 1024 * 1024 })).toBe('La captura supera los 5 MB')
  })
  it('paths atados al informe y a la captura', () => {
    const p = pathDeCaptura(ID, 'zonaprop', U, 'Captura.jpeg')
    expect(p).toBe(`informes/${ID}/captura-zonaprop-${U}.jpg`)
    expect(esPathDeCaptura(p, ID, 'zonaprop')).toBe(true)
    expect(esPathDeCaptura(p, ID, 'argenprop')).toBe(false)
    expect(esPathDeCaptura(`${p}/../../otra`, ID, 'zonaprop')).toBe(false)
    expect(esPathDeCaptura(p.replace(ID, U), ID, 'zonaprop')).toBe(false)
  })
})

describe('PDF', () => {
  it('path exacto', () => {
    expect(esPathDelPdf(pathDelPdf(ID, U), ID)).toBe(true)
    expect(esPathDelPdf(`informes/${ID}/otro-${U}.pdf`, ID)).toBe(false)
  })
  it('se reconoce por sus bytes', () => {
    expect(esPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe(true)
    expect(esPdf(new Uint8Array([0x4d, 0x5a]))).toBe(false)
    expect(esImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(true)
    expect(esImagen(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false)
  })
  it('nombre de descarga legible', () => {
    expect(nombreDelPdf('Roque Pérez 3059', '2026-10-01', '2026-10-15')).toBe('Informe quincenal - Roque Pérez 3059 - 01-10 al 15-10.pdf')
    expect(nombreDelPdf('Av. "Rara"/<x>', '2026-10-01', '2026-10-15')).toBe('Informe quincenal - Av. Rarax - 01-10 al 15-10.pdf')
  })
})
