import { describe, it, expect } from 'vitest'
import { classifyAttributes, type MlRawAttribute } from './category-attributes'

const RAW: MlRawAttribute[] = [
  { id: 'ROOMS', name: 'Ambientes', value_type: 'number', tags: { required: true } },
  {
    id: 'ORIENTATION', name: 'Orientación', value_type: 'list',
    values: [{ id: '1', name: 'Norte' }, { id: '2', name: 'Sur' }],
  },
  {
    id: 'COVERED_AREA', name: 'Sup. cubierta', value_type: 'number_unit',
    allowed_units: [{ id: 'm2', name: 'm²' }],
  },
  { id: 'INTERNAL_ID', name: 'ID interno', value_type: 'string', tags: { hidden: true } },
  { id: 'CALC', name: 'Calculado', value_type: 'string', tags: { read_only: true } },
  { id: 'COLOR', name: 'Color', value_type: 'string', tags: { variation_attribute: true } },
]

describe('classifyAttributes', () => {
  it('separa required de recommended', () => {
    const { required, recommended } = classifyAttributes(RAW)
    expect(required.map(a => a.id)).toEqual(['ROOMS'])
    expect(recommended.map(a => a.id)).toEqual(['ORIENTATION', 'COVERED_AREA'])
  })
  it('excluye hidden / read_only / variation_attribute', () => {
    const { required, recommended } = classifyAttributes(RAW)
    const all = [...required, ...recommended].map(a => a.id)
    expect(all).not.toContain('INTERNAL_ID')
    expect(all).not.toContain('CALC')
    expect(all).not.toContain('COLOR')
  })
  it('normaliza valueType y allowedValues/allowedUnits', () => {
    const { recommended } = classifyAttributes(RAW)
    const orient = recommended.find(a => a.id === 'ORIENTATION')!
    expect(orient.valueType).toBe('list')
    expect(orient.allowedValues).toEqual([{ id: '1', name: 'Norte' }, { id: '2', name: 'Sur' }])
    const area = recommended.find(a => a.id === 'COVERED_AREA')!
    expect(area.valueType).toBe('number_unit')
    expect(area.allowedUnits).toEqual(['m²'])
  })
})
