// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { leerBloqueOculto, olvidarBloqueOculto, recordarBloqueOculto } from './hidden-blocks'
import type { LandingBlock } from '@/lib/landing/schema'

/**
 * Memoria de las secciones ocultas del editor de landing.
 *
 * Antes vivía en un `useRef`: el asesor ocultaba "Ubicación", salía del editor y
 * al volver y prenderla de nuevo recibía el bloque por defecto — el texto de
 * zona que había escrito la IA (y la foto de fondo) no estaban en ningún lado.
 */

const UBICACION: LandingBlock = {
  id: 'location',
  type: 'location_showcase',
  eyebrow: 'Ubicación',
  title: 'Palermo',
  body: 'A dos cuadras del Botánico, rodeado de bares y con el subte D a mano.',
  photoIndex: 4,
  showMap: true,
}

beforeEach(() => { window.localStorage.clear() })

describe('memoria de secciones ocultas', () => {
  it('devuelve null cuando no hay nada recordado', () => {
    expect(leerBloqueOculto('prop-1', 'location')).toBeNull()
  })

  it('recuerda el bloque con TODO su contenido y lo devuelve igual', () => {
    recordarBloqueOculto('prop-1', UBICACION)
    expect(leerBloqueOculto('prop-1', 'location')).toEqual(UBICACION)
  })

  it('sobrevive a "recargar la página" (otra lectura, sin estado en memoria)', () => {
    recordarBloqueOculto('prop-1', UBICACION)
    // Simula la recarga: lo único que queda es lo que haya en el navegador.
    const recuperado = leerBloqueOculto('prop-1', 'location')
    expect(recuperado?.type).toBe('location_showcase')
    expect((recuperado as typeof UBICACION).body).toContain('Botánico')
    expect((recuperado as typeof UBICACION).photoIndex).toBe(4)
  })

  it('no mezcla propiedades', () => {
    recordarBloqueOculto('prop-1', UBICACION)
    expect(leerBloqueOculto('prop-2', 'location')).toBeNull()
  })

  it('guarda varias secciones a la vez sin pisarse', () => {
    const galeria: LandingBlock = {
      id: 'gallery', type: 'curated_gallery', eyebrow: 'La propiedad',
      title: 'Recorré cada rincón', photoIndices: [2, 0, 5],
    }
    recordarBloqueOculto('prop-1', UBICACION)
    recordarBloqueOculto('prop-1', galeria)
    expect(leerBloqueOculto('prop-1', 'location')).toEqual(UBICACION)
    expect(leerBloqueOculto('prop-1', 'gallery')).toEqual(galeria)
  })

  it('olvida el bloque una vez que se volvió a mostrar', () => {
    recordarBloqueOculto('prop-1', UBICACION)
    olvidarBloqueOculto('prop-1', 'location')
    expect(leerBloqueOculto('prop-1', 'location')).toBeNull()
  })

  it('descarta lo guardado si está corrupto (no rompe el editor)', () => {
    window.localStorage.setItem('landingEditorSeccionesOcultas:prop-1', 'esto no es JSON')
    expect(leerBloqueOculto('prop-1', 'location')).toBeNull()
  })

  it('descarta un bloque que ya no pasa el schema', () => {
    window.localStorage.setItem(
      'landingEditorSeccionesOcultas:prop-1',
      JSON.stringify({ location: { id: 'location', type: 'tipo_inventado' } }),
    )
    expect(leerBloqueOculto('prop-1', 'location')).toBeNull()
  })

  it('descarta un bloque cuyo id no coincide (rompería el orden curado)', () => {
    window.localStorage.setItem(
      'landingEditorSeccionesOcultas:prop-1',
      JSON.stringify({ location: { ...UBICACION, id: 'otro' } }),
    )
    expect(leerBloqueOculto('prop-1', 'location')).toBeNull()
  })
})
