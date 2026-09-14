import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regla del dueño (2026-09-14): al captar desde una tasación, la propiedad NO
 * hereda las fotos de la tasación. Esas fotos son material del informe
 * (capturas de Street View, del mapa) y así entró la imagen incrustada de 4,4 MB
 * que hizo fallar MercadoLibre (413) y Argenprop en vivo. Las fotos del aviso
 * son SOLO las que se suben a mano en Multimedia.
 *
 * Se afirma sobre el código porque la página necesita media plataforma para
 * montarse; lo que protege es que nadie vuelva a leer `property_images` acá.
 */
describe('alta de propiedad desde tasación', () => {
  const codigo = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

  it('no lee las fotos de la tasación ni las manda en el alta', () => {
    expect(codigo).not.toContain('property_images')
    expect(codigo).not.toContain('Fotos heredadas')
    expect(codigo).not.toMatch(/photos:\s*photos/)
  })

  it('sigue precargando el resto de la tasación (dirección, precio, ambientes)', () => {
    expect(codigo).toContain('appr.property_title')
    expect(codigo).toContain('appr.publication_price')
    expect(codigo).toContain('f.rooms')
  })
})
