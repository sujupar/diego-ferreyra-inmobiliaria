import { describe, it, expect } from 'vitest'
import { avisosDeCoherencia } from './coherencia'
import type { InventarioFotos } from './tipos'

const inventario = (nombres: string[]): InventarioFotos => ({
  ambientes: nombres.map((nombre, i) => ({ nombre, fotos: [i + 1], detalle: '' })),
  exteriores: [], edificio: [], vistas: [], estilo: '', estadoGeneral: '',
  puntosFuertes: [], noSeVe: [], fotosAmbientadas: [], compradorSugerido: { perfil: '', porque: '' },
})

describe('avisosDeCoherencia', () => {
  it('avisa si las fotos muestran más dormitorios que la ficha (caso real Díaz Colodrero con fotos de otra propiedad)', () => {
    const avisos = avisosDeCoherencia(
      inventario(['Living comedor', 'Cocina', 'Baño', 'Dormitorio secundario / Escritorio', 'Dormitorio principal']),
      { bedrooms: 1, bathrooms: 1 },
    )
    expect(avisos).toEqual([
      'Las fotos muestran 2 dormitorios y la ficha dice 1. Revisá que las fotos sean de esta propiedad o corregí la ficha.',
    ])
  })

  it('no avisa si las fotos muestran menos ambientes (no siempre se fotografía todo)', () => {
    expect(avisosDeCoherencia(inventario(['Living', 'Dormitorio de servicio', 'Baño principal']), { bedrooms: 3, bathrooms: 3 })).toEqual([])
  })

  it('cuenta toilette como baño y avisa si sobran', () => {
    expect(avisosDeCoherencia(inventario(['Baño', 'Toilette']), { bedrooms: null, bathrooms: 1 }))
      .toEqual(['Las fotos muestran 2 baños y la ficha dice 1. Revisá que las fotos sean de esta propiedad o corregí la ficha.'])
  })

  it('sin dato en la ficha no compara', () => {
    expect(avisosDeCoherencia(inventario(['Dormitorio 1', 'Dormitorio 2']), { bedrooms: null, bathrooms: null })).toEqual([])
  })

  it('no confunde "baño" dentro de otro nombre ni cuenta el pasillo', () => {
    expect(avisosDeCoherencia(inventario(['Pasillo', 'Dormitorio principal en suite']), { bedrooms: 1, bathrooms: 1 })).toEqual([])
  })
})
