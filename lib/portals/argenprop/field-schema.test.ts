import { describe, it, expect } from 'vitest'
import { AP_CATEGORIA, apCategoria, getApSchema, derivedPrefill, apCodigo } from './field-schema'

const baseProp = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento', operation_type: 'venta',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
  covered_area: 95, total_area: 110, age: 15, expensas: 50000, currency: 'USD',
} as never

describe('field-schema argenprop', () => {
  it('mapea property_type a Categoria {Tipo, Subtipo}', () => {
    expect(AP_CATEGORIA.departamento).toEqual({ tipo: 'DEPARTAMENTO' })
    expect(AP_CATEGORIA.ph).toEqual({ tipo: 'DEPARTAMENTO', subtipo: 'PH' })
    expect(apCategoria({ property_type: 'casa' } as never)).toEqual({ tipo: 'CASA' })
  })

  it('getApSchema devuelve required (operación/moneda/ambientes) + recommended', () => {
    const s = getApSchema(baseProp)
    expect(s.categoryId).toBe('DEPARTAMENTO')
    expect(s.required.map(f => f.id)).toEqual(['TIPO_OPERACION', 'MONEDA', 'CANTIDAD_AMBIENTES'])
    expect(s.recommended.find(f => f.id === 'ESTADO_PROPIEDAD')?.allowedValues?.length).toBeGreaterThan(0)
    expect(s.recommended.some(f => f.id === 'SUBTIPO')).toBe(true)
  })

  it('derivedPrefill mapea a los Ids reales de Argenprop', () => {
    const pf = derivedPrefill(baseProp)
    expect(pf.TIPO_OPERACION).toEqual({ value_id: 'VENTA' })
    expect(pf.MONEDA).toEqual({ value_id: 'USD' })
    expect(pf.CANTIDAD_AMBIENTES).toEqual({ value_name: '3' })
    expect(pf.CANTIDAD_DORMITORIOS).toEqual({ value_name: '2' })
    expect(pf.SUPERFICIE_CUBIERTA).toEqual({ value_name: '95' })
    expect(pf.ANTIGUEDAD).toEqual({ value_name: '15' })
  })

  it('derivedPrefill traduce alquiler/temporario y ARS', () => {
    const pf = derivedPrefill({ operation_type: 'alquiler', currency: 'ARS' } as never)
    expect(pf.TIPO_OPERACION).toEqual({ value_id: 'ALQUILER' })
    expect(pf.MONEDA).toEqual({ value_id: 'ARS' })
    const pf2 = derivedPrefill({ operation_type: 'temporario', currency: 'USD' } as never)
    expect(pf2.TIPO_OPERACION).toEqual({ value_id: 'ALQUILER_TEMPORAL' })
  })

  it('apCodigo es determinístico, con prefijo 60U6_ y sin guiones', () => {
    const a = apCodigo(baseProp)
    expect(a).toBe(apCodigo(baseProp))
    expect(a).toMatch(/^60U6_[0-9a-f]{12}$/)
  })
})
