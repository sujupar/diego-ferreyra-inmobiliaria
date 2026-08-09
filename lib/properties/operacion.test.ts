/**
 * `properties.operation_type` es texto libre en Postgres — no hay CHECK que
 * avise. El único freno real es que TODOS los que la escriben y la leen usen los
 * mismos tres literales. Estos tests atan el catálogo del alta a los mappers de
 * los portales: si alguien agrega "alquiler_temporario" a uno solo de los lados,
 * acá se pone rojo antes de que un temporario se publique como venta.
 */
import { describe, it, expect } from 'vitest'
import { OPERACIONES, OPERACIONES_VALORES, esOperacion } from './operacion'
import { ML_OPERACIONES_SOPORTADAS } from '@/lib/portals/mercadolibre/mapping'
import { derivedPrefill } from '@/lib/portals/argenprop/field-schema'
import { operationLabel } from './detail-view'

describe('catálogo de operaciones', () => {
  it('son exactamente los tres que soporta MercadoLibre', () => {
    expect([...OPERACIONES_VALORES]).toEqual([...ML_OPERACIONES_SOPORTADAS])
  })

  it('el desplegable del alta ofrece esos mismos valores, en ese orden', () => {
    expect(OPERACIONES.map(o => o.valor)).toEqual([...OPERACIONES_VALORES])
  })

  it('rechaza las formas que la base aceptaría callada', () => {
    expect(esOperacion('alquiler_temporario')).toBe(false)
    expect(esOperacion('Venta')).toBe(false)
    expect(esOperacion('')).toBe(false)
    expect(esOperacion(undefined)).toBe(false)
    for (const v of OPERACIONES_VALORES) expect(esOperacion(v)).toBe(true)
  })
})

describe('los tres valores llegan distintos a cada portal', () => {
  const base = {
    id: '00000000-0000-0000-0000-000000000001',
    property_type: 'departamento', address: 'Junín 1200', neighborhood: 'Recoleta',
    city: 'CABA', asking_price: 250000, currency: 'USD',
  }

  it('Argenprop mapea cada operación a un TIPO_OPERACION propio', () => {
    const ids = OPERACIONES_VALORES.map(op => {
      const prefill = derivedPrefill({ ...base, operation_type: op } as never)
      return prefill.TIPO_OPERACION?.value_id
    })
    expect(ids).toEqual(['VENTA', 'ALQUILER', 'ALQUILER_TEMPORAL'])
    expect(new Set(ids).size).toBe(3)
  })

  it('la ficha nombra cada operación distinto — un temporario no dice "en venta"', () => {
    const etiquetas = OPERACIONES_VALORES.map(op => operationLabel(op))
    expect(etiquetas).toEqual(['en venta', 'en alquiler', 'en alquiler temporario'])
    expect(new Set(etiquetas).size).toBe(3)
  })
})
