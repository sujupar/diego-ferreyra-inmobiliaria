import { describe, it, expect } from 'vitest'
import { AP_TIPO_PROPIEDAD, getApSchema, derivedPrefill, apAvisoId } from './field-schema'

const baseProp = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento',
  operation_type: 'venta',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
  covered_area: 95, total_area: 110, age: 15, floor: 4,
  expensas: 50000, currency: 'USD',
} as never

describe('field-schema argenprop', () => {
  it('mapea property_type a un código de TipoPropiedad', () => {
    expect(AP_TIPO_PROPIEDAD.departamento).toBe('1')
    expect(AP_TIPO_PROPIEDAD.casa).toBe('3')
  })

  it('getApSchema devuelve required + recommended para depto', () => {
    const s = getApSchema(baseProp)
    expect(s.required.length).toBeGreaterThan(0)
    expect(s.required.every(f => f.id && f.name && f.valueType)).toBe(true)
  })

  it('derivedPrefill rellena ambientes/dormitorios/superficie desde la propiedad', () => {
    const pf = derivedPrefill(baseProp)
    expect(pf.AMBIENTES?.value_name).toBe('3')
    expect(pf.DORMITORIOS?.value_name).toBe('2')
    expect(pf.SUP_CUBIERTA?.value_name).toBe('95')
  })

  it('apAvisoId es determinístico y estable por propiedad', () => {
    const a = apAvisoId(baseProp)
    const b = apAvisoId(baseProp)
    expect(a).toBe(b)
    expect(a).toMatch(/^df-/)
  })
})
