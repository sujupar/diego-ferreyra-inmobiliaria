import { describe, it, expect } from 'vitest'
import { fijosDeCategoria, armarCambioDeCategoriaMl, armarCambioDePrecioMl } from './cambio-categoria'
import type { MlItemVivo } from './edicion'
import type { MlRawAttribute } from './category-attributes'

// Atributos mínimos con la forma real de /categories/{id}/attributes (sonda 2026-11-11).
const rawCasa: MlRawAttribute[] = [
  { id: 'PROPERTY_TYPE', name: 'Tipo', value_type: 'list', tags: { fixed: true }, values: [{ id: '242062', name: 'Casa' }] },
  { id: 'OPERATION', name: 'Operación', value_type: 'list', tags: { fixed: true }, values: [{ id: '242075', name: 'Venta' }] },
  { id: 'ROOMS', name: 'Ambientes', value_type: 'number' },
  { id: 'HAS_GARDEN', name: 'Jardín', value_type: 'boolean' },
  { id: 'MAINTENANCE_FEE', name: 'Expensas', value_type: 'number_unit' },
  { id: 'HAS_LOWER_PRICE', name: 'Precio menor', value_type: 'boolean' },
  { id: 'COVERED_AREA', name: 'Cubierta', value_type: 'number_unit', tags: { read_only: true } },
  { id: 'SIN_VALOR', name: 'Fijo sin valor', value_type: 'list', tags: { fixed: true } },
]

const item: MlItemVivo = {
  id: 'MLA1', title: 't', status: 'active', category_id: 'MLA401686', price: 79000,
  attributes: [
    { id: 'PROPERTY_TYPE', value_id: '242062x', value_name: 'Departamento' },
    { id: 'OPERATION', value_id: '242075', value_name: 'Venta' },
    { id: 'OPERATION_SUBTYPE', value_id: '1', value_name: 'Desarrollo' },
    { id: 'ROOMS', value_id: null, value_name: '3' },
    { id: 'HAS_GARDEN', value_id: '242085', value_name: 'Sí' },
    { id: 'MAINTENANCE_FEE', value_id: null, value_name: '50000 ARS' },
    { id: 'FLOOR', value_id: null, value_name: '4' },
    { id: 'HAS_LOWER_PRICE', value_id: '242085', value_name: 'Sí' },
    { id: 'COVERED_AREA', value_id: null, value_name: '95 m²' },
  ],
}

describe('fijosDeCategoria', () => {
  it('toma solo tags.fixed con un valor', () => {
    expect(fijosDeCategoria(rawCasa)).toEqual([
      { id: 'PROPERTY_TYPE', value_id: '242062', value_name: 'Casa' },
      { id: 'OPERATION', value_id: '242075', value_name: 'Venta' },
    ])
  })
})

describe('armarCambioDeCategoriaMl', () => {
  const { body } = armarCambioDeCategoriaMl(item, rawCasa, 'MLA401685', null)
  const attrs = body.attributes as { id: string; value_id?: string; value_name?: string }[]
  const ids = attrs.map(a => a.id)

  it('manda la categoría nueva y el tipo de los fijos de la nueva', () => {
    expect(body.category_id).toBe('MLA401685')
    expect(attrs.find(a => a.id === 'PROPERTY_TYPE')).toEqual({ id: 'PROPERTY_TYPE', value_id: '242062', value_name: 'Casa' })
    expect(ids.filter(i => i === 'PROPERTY_TYPE')).toHaveLength(1)
  })
  it('conserva los vivos que la nueva acepta', () => {
    expect(ids).toEqual(expect.arrayContaining(['ROOMS', 'HAS_GARDEN', 'MAINTENANCE_FEE']))
    expect(attrs.find(a => a.id === 'HAS_GARDEN')).toEqual({ id: 'HAS_GARDEN', value_id: '242085', value_name: 'Sí' })
  })
  it('descarta lo que la nueva no lista, lo calculado y lo read_only', () => {
    expect(ids).not.toContain('FLOOR')
    expect(ids).not.toContain('OPERATION_SUBTYPE')
    expect(ids).not.toContain('HAS_LOWER_PRICE')
    expect(ids).not.toContain('COVERED_AREA')
  })
  it('sin precio no manda price ni currency_id', () => {
    expect(body).not.toHaveProperty('price')
    expect(body).not.toHaveProperty('currency_id')
  })
  it('con precio manda price y currency_id juntos', () => {
    const r = armarCambioDeCategoriaMl(item, rawCasa, 'MLA401685', { monto: 75000.4, moneda: 'usd' })
    expect(r.body.price).toBe(75000)
    expect(r.body.currency_id).toBe('USD')
  })
})

describe('armarCambioDePrecioMl', () => {
  it('redondea y pone la moneda en mayúsculas', () => {
    expect(armarCambioDePrecioMl({ monto: 74999.6, moneda: 'ars' })).toEqual({ price: 75000, currency_id: 'ARS' })
  })
})
