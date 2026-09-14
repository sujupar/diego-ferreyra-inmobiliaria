import { describe, it, expect } from 'vitest'
import {
  atributosMlDerivadosDeVisita,
  atributosApDerivadosDeVisita,
  camposPendientesDeVisita,
  armarDatosDifusionDesdeVisita,
  ATRIBUTOS_ML_ADMINISTRATIVOS,
} from './datos-visita'
import type { SaleVisitData, VisitDataSnapshot } from '@/types/visit-data.types'
import type { CategoryAttribute } from './mercadolibre/category-attributes'
import type { ApField } from './argenprop/field-schema'

const visita: SaleVisitData = {
  property_type: 'departamento', property_type_other: null,
  rooms: 2, bedrooms: 1, bathrooms: 1, garages: null,
  covered_m2: 43, semi_covered_m2: null, uncovered_m2: 3, total_m2: 44.5, terrain_m2: null,
  age_years: 43, is_refurbished: false,
  orientation: 'N', floor: 9, total_floors: 10,
  disposition: 'frente', quality: 'buena', conservation: 'estado_2',
  construction_features: [], reason_for_sale: null, sale_timeframe: null,
  strong_points: [], extra_notes: null,
}

function attr(id: string, valueType: CategoryAttribute['valueType'] = 'boolean', required = false): CategoryAttribute {
  return { id, name: id, valueType, required } as CategoryAttribute
}
function apField(id: string, valueType: ApField['valueType'] = 'list'): ApField {
  return { id, name: id, valueType, required: false }
}

describe('atributosMlDerivadosDeVisita', () => {
  it('mapea lo que la visita ya sabe a los ids de ML (piso, plantas, disposición, orientación, antigüedad)', () => {
    const r = atributosMlDerivadosDeVisita(visita)
    expect(r.UNIT_FLOOR).toEqual({ value_name: '9' })
    expect(r.FLOORS).toEqual({ value_name: '10' })
    expect(r.DISPOSITION).toEqual({ value_name: 'Frente' })
    expect(r.FACING).toEqual({ value_name: 'Norte' })
    expect(r.PROPERTY_AGE).toEqual({ value_name: '43 años' })
    expect(r.ROOMS).toEqual({ value_name: '2' })
    expect(r.COVERED_AREA).toEqual({ value_name: '43 m²' })
    expect(r.TOTAL_AREA).toEqual({ value_name: '44.5 m²' })
  })
  it('una orientación compuesta (NE) no tiene equivalente en ML y no se manda', () => {
    expect(atributosMlDerivadosDeVisita({ ...visita, orientation: 'NE' }).FACING).toBeUndefined()
  })
  it('antigüedad 0 es "A estrenar"; null no se manda', () => {
    expect(atributosMlDerivadosDeVisita({ ...visita, age_years: 0 }).PROPERTY_AGE).toEqual({ value_name: 'A estrenar' })
    expect(atributosMlDerivadosDeVisita({ ...visita, age_years: null }).PROPERTY_AGE).toBeUndefined()
  })
})

describe('atributosApDerivadosDeVisita', () => {
  it('orientación, disposición y estado desde la conservación', () => {
    const r = atributosApDerivadosDeVisita(visita)
    expect(r.ORIENTACION).toEqual({ value_id: 'NORTE' })
    expect(r.DISPOSICION).toEqual({ value_id: 'FRENTE' })
    expect(r.ESTADO_PROPIEDAD).toEqual({ value_id: 'MUY_BUENO' })
  })
  it('estado_3 → bueno, estado_4 → regular, estado_5 → a refaccionar, estado_1 → excelente', () => {
    expect(atributosApDerivadosDeVisita({ ...visita, conservation: 'estado_1' }).ESTADO_PROPIEDAD).toEqual({ value_id: 'EXCELENTE' })
    expect(atributosApDerivadosDeVisita({ ...visita, conservation: 'estado_3' }).ESTADO_PROPIEDAD).toEqual({ value_id: 'BUENO' })
    expect(atributosApDerivadosDeVisita({ ...visita, conservation: 'estado_4' }).ESTADO_PROPIEDAD).toEqual({ value_id: 'REGULAR' })
    expect(atributosApDerivadosDeVisita({ ...visita, conservation: 'estado_5' }).ESTADO_PROPIEDAD).toEqual({ value_id: 'A_REFACCIONAR' })
    expect(atributosApDerivadosDeVisita({ ...visita, conservation: null }).ESTADO_PROPIEDAD).toBeUndefined()
  })
  it('contrafrente → CONTRA_FRENTE (el id de Argenprop lleva guion bajo)', () => {
    expect(atributosApDerivadosDeVisita({ ...visita, disposition: 'contrafrente' }).DISPOSICION).toEqual({ value_id: 'CONTRA_FRENTE' })
  })
})

describe('camposPendientesDeVisita', () => {
  const ml = {
    required: [attr('ROOMS', 'number', true), attr('COVERED_AREA', 'number_unit', true), attr('PARKING_LOTS', 'number', true)],
    recommended: [
      attr('HAS_BALCONY'), attr('HAS_LIFT'), attr('MAINTENANCE_FEE', 'number_unit'), attr('DISPOSITION', 'list'),
      attr('APARTMENT_PROPERTY_SUBTYPE', 'list'), attr('CONTACT_SCHEDULE', 'string'), attr('PROPERTY_CODE', 'string'),
      attr('WAREHOUSES', 'number'),
    ],
  }
  const ap = {
    required: [apField('TIPO_OPERACION'), apField('MONEDA'), apField('CANTIDAD_AMBIENTES', 'number')],
    recommended: [apField('SUBTIPO'), apField('CANTIDAD_DORMITORIOS', 'number'), apField('EXPENSAS', 'number'), apField('ESTADO_PROPIEDAD'), apField('ORIENTACION')],
  }

  it('saca lo que ya se deriva de la visita/propiedad y lo administrativo; separa el checklist Sí/No', () => {
    const r = camposPendientesDeVisita({ ml, ap })
    expect(r.ml.checklist.map(a => a.id)).toEqual(['HAS_BALCONY', 'HAS_LIFT'])
    expect(r.ml.otros.map(a => a.id)).toEqual(['APARTMENT_PROPERTY_SUBTYPE', 'WAREHOUSES'])
    expect(r.ap.map(f => f.id)).toEqual(['SUBTIPO', 'ESTADO_PROPIEDAD'])
  })
  it('las expensas se piden UNA vez como campo propio, no como atributo de cada portal', () => {
    const r = camposPendientesDeVisita({ ml, ap })
    expect(r.ml.otros.some(a => a.id === 'MAINTENANCE_FEE')).toBe(false)
    expect(r.ap.some(f => f.id === 'EXPENSAS')).toBe(false)
  })
  it('si la visita no trae estado de conservación, Argenprop sí pide Estado', () => {
    const r = camposPendientesDeVisita({ ml, ap })
    expect(r.ap.map(f => f.id)).toContain('ESTADO_PROPIEDAD')
  })
  it('sin schema de ML (portal caído) el bloque de ML queda vacío y el de Argenprop sigue', () => {
    const r = camposPendientesDeVisita({ ml: null, ap })
    expect(r.ml.checklist).toEqual([])
    expect(r.ml.otros).toEqual([])
    expect(r.ap.length).toBeGreaterThan(0)
  })
  it('los administrativos son los que se piden recién al publicar', () => {
    expect(ATRIBUTOS_ML_ADMINISTRATIVOS).toContain('CONTACT_SCHEDULE')
    expect(ATRIBUTOS_ML_ADMINISTRATIVOS).toContain('PROPERTY_CODE')
  })
})

describe('armarDatosDifusionDesdeVisita', () => {
  const snapshot: VisitDataSnapshot = {
    sale: visita,
    purchase: null,
    portales: {
      expensas: 85000,
      ml: { HAS_BALCONY: { value_name: 'Sí' }, HAS_LIFT: { value_name: 'Sí' }, UNIT_FLOOR: { value_name: '7' } },
      ap: { SUBTIPO: { value_id: 'PISO' } },
    },
    landing: { q1: 'Pareja joven', q2: 'Luz', q3: 'Expensas', q4: 'Subte' },
    updated_at: '2026-09-14T00:00:00Z',
  }

  it('mezcla derivados + respuestas (la respuesta del asesor manda) y copia expensas y landing', () => {
    const r = armarDatosDifusionDesdeVisita(snapshot)
    expect(r.expensas).toBe(85000)
    expect(r.portal_data.ml.HAS_BALCONY).toEqual({ value_name: 'Sí' })
    expect(r.portal_data.ml.DISPOSITION).toEqual({ value_name: 'Frente' })
    expect(r.portal_data.ml.UNIT_FLOOR).toEqual({ value_name: '7' }) // lo contestado pisa lo derivado
    expect(r.portal_data.ap.SUBTIPO).toEqual({ value_id: 'PISO' })
    expect(r.portal_data.ap.ORIENTACION).toEqual({ value_id: 'NORTE' })
    expect(r.landing_answers).toEqual({ q1: 'Pareja joven', q2: 'Luz', q3: 'Expensas', q4: 'Subte' })
  })
  it('respuestas vacías de la landing no se copian', () => {
    const r = armarDatosDifusionDesdeVisita({ ...snapshot, landing: { q1: 'x', q2: '  ', q3: '' } })
    expect(r.landing_answers).toEqual({ q1: 'x' })
  })
  it('sin sección de portales ni landing: solo derivados, sin expensas', () => {
    const r = armarDatosDifusionDesdeVisita({ sale: visita, purchase: null, updated_at: '' })
    expect(r.expensas).toBeNull()
    expect(r.portal_data.ml.FLOORS).toEqual({ value_name: '10' })
    expect(r.landing_answers).toEqual({})
  })
  it('sin datos de visita (null) no explota', () => {
    const r = armarDatosDifusionDesdeVisita(null)
    expect(r).toEqual({ expensas: null, portal_data: { ml: {}, ap: {} }, landing_answers: {} })
  })
})
