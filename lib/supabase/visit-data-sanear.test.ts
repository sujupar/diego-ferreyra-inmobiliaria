import { describe, it, expect } from 'vitest'
import { sanearSnapshotVisita } from './visit-data-sanear'

/**
 * Lo que llega del navegador al PATCH de visit-data se mezcla TAL CUAL en un
 * JSONB. Las claves nuevas (portales, landing) las escribe un formulario, pero
 * también podría escribirlas cualquiera con sesión: se sanean antes de mezclar.
 */
describe('sanearSnapshotVisita', () => {
  it('deja pasar sale/purchase como vienen (comportamiento previo intacto)', () => {
    const r = sanearSnapshotVisita({ sale: { rooms: 2 }, purchase: null })
    expect(r).toEqual({ sale: { rooms: 2 }, purchase: null })
  })

  it('landing: solo strings, recortadas a 1500, sin claves vacías', () => {
    const r = sanearSnapshotVisita({ landing: { q1: ' Pareja joven ', q2: 'x'.repeat(2000), q3: 7, q4: '' } })
    expect(r.landing).toEqual({ q1: 'Pareja joven', q2: 'x'.repeat(1500) })
  })

  it('portales: expensas numérica ≥ 0 o null; valores de atributo solo con value_id/value_name string', () => {
    const r = sanearSnapshotVisita({
      portales: {
        expensas: '85000',
        ml: { HAS_BALCONY: { value_name: 'Sí' }, MALO: 'x', OTRO: { value_id: 5 }, LARGO: { value_name: 'y'.repeat(500) } },
        ap: { SUBTIPO: { value_id: 'PISO', extra: 'no' } },
      },
    })
    expect(r.portales).toEqual({
      expensas: 85000,
      ml: { HAS_BALCONY: { value_name: 'Sí' }, LARGO: { value_name: 'y'.repeat(200) } },
      ap: { SUBTIPO: { value_id: 'PISO' } },
    })
  })

  it('expensas negativa o no numérica → null', () => {
    expect(sanearSnapshotVisita({ portales: { expensas: -5, ml: {}, ap: {} } }).portales?.expensas).toBeNull()
    expect(sanearSnapshotVisita({ portales: { expensas: 'abc', ml: {}, ap: {} } }).portales?.expensas).toBeNull()
  })

  it('claves de atributo raras se descartan (solo MAYÚSCULAS, dígitos y guion bajo)', () => {
    const r = sanearSnapshotVisita({ portales: { ml: { 'has balcony': { value_name: 'Sí' }, HAS_LIFT: { value_name: 'Sí' } } } })
    expect(Object.keys(r.portales?.ml ?? {})).toEqual(['HAS_LIFT'])
  })

  it('un body que no es objeto → snapshot vacío', () => {
    expect(sanearSnapshotVisita(null)).toEqual({})
    expect(sanearSnapshotVisita('x')).toEqual({})
  })
})
