import { describe, expect, it } from 'vitest'
import { pdfPuedeDibujar } from './formato-imagen'

describe('pdfPuedeDibujar', () => {
  it('JPEG y PNG sí', () => {
    expect(pdfPuedeDibujar('data:image/jpeg;base64,AAA')).toBe(true)
    expect(pdfPuedeDibujar('data:image/jpg;base64,AAA')).toBe(true)
    expect(pdfPuedeDibujar('data:image/PNG;base64,AAA')).toBe(true)
  })
  it('webp, avif y gif no (hay que convertirlas antes)', () => {
    expect(pdfPuedeDibujar('data:image/webp;base64,AAA')).toBe(false)
    expect(pdfPuedeDibujar('data:image/avif;base64,AAA')).toBe(false)
    expect(pdfPuedeDibujar('data:image/gif;base64,AAA')).toBe(false)
    expect(pdfPuedeDibujar('')).toBe(false)
  })
})
