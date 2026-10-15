import { describe, it, expect } from 'vitest'
import { opcionesDeLaEncuesta, etiquetaDeOpcion, MAX_OPCIONES, type PropiedadParaOpciones } from './opciones'

const base: PropiedadParaOpciones = { property_type: 'departamento', amenities: [], garages: 0, floor: 2, expensas: 0 }
const claves = (o: { clave: string }[]) => o.map(x => x.clave)

describe('opcionesDeLaEncuesta (spec §4.8)', () => {
  it('un depto sin nada especial: las 5 de siempre + "Otra cosa"', () => {
    const o = opcionesDeLaEncuesta(base)
    expect(claves(o.masGusto)).toEqual(['ubicacion', 'luz', 'distribucion', 'estado', 'tamano', 'otra'])
    expect(claves(o.menosGusto)).toEqual(['precio', 'tamano', 'estado', 'ruido', 'nada', 'otra'])
  })
  it('suma lo que tiene ESA propiedad, con tildes en forma NFD también', () => {
    const o = opcionesDeLaEncuesta({ ...base, amenities: ['Balcón', 'Pileta'], garages: 1, floor: 9, expensas: 120000 })
    expect(claves(o.masGusto)).toContain('balcon_terraza')
    expect(claves(o.masGusto)).toContain('cochera')
    expect(o.masGusto.length).toBeLessThanOrEqual(MAX_OPCIONES)
    expect(o.masGusto.at(-1)?.clave).toBe('otra')
    expect(claves(o.menosGusto)).toContain('expensas')
  })
  it('una casa ofrece patio o jardín aunque no lo diga en amenities', () => {
    expect(claves(opcionesDeLaEncuesta({ ...base, property_type: 'casa' }).masGusto)).toContain('patio_jardin')
  })
  it('nunca pasa de 8, ni con todo cargado', () => {
    const o = opcionesDeLaEncuesta({ ...base, property_type: 'casa', amenities: ['Terraza', 'Gimnasio', 'Cochera'], garages: 2, floor: 12, expensas: 1 })
    expect(o.masGusto).toHaveLength(MAX_OPCIONES)
  })
  it('amenities que no son una lista (dato viejo) no rompen', () => {
    expect(() => opcionesDeLaEncuesta({ ...base, amenities: 'pileta' })).not.toThrow()
    expect(() => opcionesDeLaEncuesta({ ...base, amenities: null })).not.toThrow()
  })
  it('las etiquetas son para personas', () => {
    expect(etiquetaDeOpcion('tamano')).toBe('El tamaño')
    expect(etiquetaDeOpcion('desconocida')).toBe('desconocida')
  })
})
