import { describe, it, expect } from 'vitest'
import { validarInventario, promptZonaWeb, entradaFotos, ESQUEMA_INVENTARIO } from './prompts-investigacion'
import { limpiarTextoWeb } from './limpiar-web'

const valido = {
  ambientes: [{ nombre: 'Living comedor', fotos: [1, 2], detalle: 'Parquet' }],
  exteriores: [{ espacio: 'Terraza', detalle: 'Amplia', uso: 'no_se_sabe', fotos: [14] }],
  edificio: ['Ascensores de reja'], vistas: ['Abierta'], estilo: 'Clásico', estadoGeneral: 'Bueno',
  puntosFuertes: ['Terraza'], noSeVe: ['Orientación'], fotosAmbientadas: [],
  compradorSugerido: { perfil: 'Pareja joven', porque: 'Tamaño y ubicación' },
}

describe('validarInventario', () => {
  it('acepta un inventario completo', () => {
    expect(validarInventario(valido)).toEqual(valido)
  })
  it('rechaza sin ambientes', () => {
    expect(validarInventario({ ...valido, ambientes: undefined })).toBeNull()
    expect(validarInventario(null)).toBeNull()
  })
  it('un uso desconocido queda como "no se sabe" (nunca como propio)', () => {
    const r = validarInventario({ ...valido, exteriores: [{ espacio: 'Patio', detalle: 'x', uso: 'privado', fotos: [3] }] })
    expect(r?.exteriores[0].uso).toBe('no_se_sabe')
  })
  it('filtra basura dentro de las listas', () => {
    const r = validarInventario({ ...valido, vistas: ['Abierta', 3, null], fotosAmbientadas: [2, 'x'] })
    expect(r?.vistas).toEqual(['Abierta'])
    expect(r?.fotosAmbientadas).toEqual([2])
  })
})

describe('ESQUEMA_INVENTARIO', () => {
  it('exige todos los campos (modo estricto de OpenAI)', () => {
    expect(ESQUEMA_INVENTARIO.required).toEqual(Object.keys(ESQUEMA_INVENTARIO.properties as object))
    expect(ESQUEMA_INVENTARIO.additionalProperties).toBe(false)
  })
})

describe('entradaFotos', () => {
  it('rotula cada foto con su número antes de la imagen', () => {
    const e = entradaFotos(['https://s/a.jpg', 'https://s/b.jpg'])
    expect(e).toEqual([
      { tipo: 'texto', texto: 'Foto 1' }, { tipo: 'imagen', url: 'https://s/a.jpg', detalle: 'low' },
      { tipo: 'texto', texto: 'Foto 2' }, { tipo: 'imagen', url: 'https://s/b.jpg', detalle: 'low' },
      { tipo: 'texto', texto: expect.stringContaining('2 fotos') },
    ])
  })
})

describe('promptZonaWeb', () => {
  it('pide la dirección concreta y prohíbe distancias', () => {
    const p = promptZonaWeb({ address: 'Perón 4227', neighborhood: 'Almagro', city: 'CABA' })
    expect(p).toContain('Perón 4227, Almagro, CABA, Argentina')
    expect(p).toMatch(/no des distancias/i)
  })
})

describe('limpiarTextoWeb', () => {
  it('saca los links dejando el texto', () => {
    expect(limpiarTextoWeb('Plaza Almagro ([zonaprop.com.ar](https://www.zonaprop.com.ar/x?utm_source=openai))'))
      .toBe('Plaza Almagro')
    expect(limpiarTextoWeb('Ver [Wikipedia](https://es.wikipedia.org/wiki/Almagro) y https://otra.com/pag'))
      .toBe('Ver Wikipedia y')
  })
  it('saca « », negritas y espacios de más, conservando renglones', () => {
    expect(limpiarTextoWeb('**Barrio**  «tranquilo»\n\n\n- Colectivos: 24')).toBe('Barrio tranquilo\n- Colectivos: 24')
  })
  it('recorta al máximo', () => {
    expect(limpiarTextoWeb('a'.repeat(50), 10)).toHaveLength(10)
  })
})
