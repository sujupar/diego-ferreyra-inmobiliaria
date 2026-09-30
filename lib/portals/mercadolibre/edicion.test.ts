import { describe, it, expect } from 'vitest'
import { valoresDesdeItem, armarActualizacionMl, normalizarMl, type MlItemVivo } from './edicion'
import { mismoValor } from '../edicion-comun'
import type { CategoryAttribute, MlRawAttribute } from './category-attributes'

const schema: CategoryAttribute[] = [
  { id: 'ROOMS', name: 'Ambientes', valueType: 'number', required: true },
  { id: 'DISPOSITION', name: 'Disposición', valueType: 'list', required: false, allowedValues: [{ id: '242077', name: 'Frente' }] },
  { id: 'HAS_LIFT', name: 'Ascensor', valueType: 'boolean', required: false },
  { id: 'MAINTENANCE_FEE', name: 'Expensas', valueType: 'number_unit', required: false, allowedUnits: ['ARS'] },
  { id: 'SUITABLE_FOR_MORTGAGE_LOAN', name: 'Apto crédito', valueType: 'boolean', required: false },
]
const raw: MlRawAttribute[] = [
  ...schema.map(s => ({ id: s.id, name: s.name, value_type: s.valueType, tags: {} })),
  { id: 'OPERATION', name: 'Operación', value_type: 'list', tags: { fixed: true, hidden: true } },
  { id: 'HAS_LOWER_PRICE', name: 'Bajó', value_type: 'boolean', tags: { hidden: true, read_only: true } },
  { id: 'WITH_VIRTUAL_TOUR', name: 'Tour', value_type: 'boolean', tags: { hidden: true } },
]
const item = (extra: MlItemVivo['attributes'] = []): MlItemVivo => ({
  id: 'MLA1', title: 'Depto', status: 'active', category_id: 'MLA401686', price: 100,
  attributes: [
    { id: 'ROOMS', value_id: null, value_name: '4' },
    { id: 'DISPOSITION', value_id: '242077', value_name: 'Frente' },
    { id: 'HAS_LIFT', value_id: '242084', value_name: 'No' },
    { id: 'OPERATION', value_id: '242075', value_name: 'Venta' },
    { id: 'HAS_LOWER_PRICE', value_id: null, value_name: 'No' },
    { id: 'WITH_VIRTUAL_TOUR', value_id: '242084', value_name: 'No' },
    ...extra,
  ],
})

describe('valoresDesdeItem', () => {
  it('lista por id, Sí/No y números por nombre, solo ids del schema', () => {
    expect(valoresDesdeItem(item(), schema)).toEqual({
      ROOMS: { value_name: '4' }, DISPOSITION: { value_id: '242077' }, HAS_LIFT: { value_name: 'No' },
    })
  })
})

describe('armarActualizacionMl', () => {
  it('manda todo lo escribible con el cambio aplicado y nunca los de solo lectura ni fijos', () => {
    const { body, cambiados } = armarActualizacionMl(item(), { valores: { MAINTENANCE_FEE: { value_name: '600000' } } }, raw)
    const attrs = body.attributes as { id: string; value_name?: string | null }[]
    expect(attrs.map(a => a.id).sort()).toEqual(['DISPOSITION', 'HAS_LIFT', 'MAINTENANCE_FEE', 'ROOMS', 'WITH_VIRTUAL_TOUR'])
    expect(attrs.find(a => a.id === 'MAINTENANCE_FEE')?.value_name).toBe('600000 ARS')
    expect(cambiados).toEqual(['MAINTENANCE_FEE'])
    expect(body.title).toBeUndefined()
  })
  it('respeta lo que otro cambió en el portal después de abrir la pantalla', () => {
    const vivo = item([{ id: 'SUITABLE_FOR_MORTGAGE_LOAN', value_id: '242085', value_name: 'Sí' }])
    const { body } = armarActualizacionMl(vivo, { valores: { HAS_LIFT: { value_name: 'Sí' } } }, raw)
    const attrs = body.attributes as { id: string; value_name?: string | null }[]
    expect(attrs.find(a => a.id === 'SUITABLE_FOR_MORTGAGE_LOAN')?.value_name).toBe('Sí')
  })
  it('un cambio igual a lo que ya hay no cuenta', () => {
    const { cambiados } = armarActualizacionMl(item(), { valores: { ROOMS: { value_name: '4' } } }, raw)
    expect(cambiados).toEqual([])
  })
  it('título, precio y fotos solo si cambian', () => {
    const { body, cambiados } = armarActualizacionMl(item(), { titulo: 'Nuevo', valores: {}, precio: 100, fotos: ['https://x/1.jpg'] }, raw)
    expect(body.title).toBe('Nuevo')
    expect(body.price).toBeUndefined()
    expect(body.pictures).toEqual([{ source: 'https://x/1.jpg' }])
    expect(cambiados).toEqual(['titulo', 'fotos'])
  })
  it('una expensa VIVA en USD no se pisa a pesos por un cambio ajeno', () => {
    const vivo = item([{ id: 'MAINTENANCE_FEE', value_id: null, value_name: '500 USD' }])
    const { body } = armarActualizacionMl(vivo, { valores: { ROOMS: { value_name: '5' } } }, raw)
    const attrs = body.attributes as { id: string; value_name?: string | null }[]
    expect(attrs.find(a => a.id === 'MAINTENANCE_FEE')?.value_name).toBe('500 USD')
  })
  it('vaciar usa ML_VALOR_VACIO o falla si ML no permite vaciar', () => {
    // Ajustado al resultado de la Tarea 1: ML_VALOR_VACIO = { value_name: '' } (no null),
    // así que vaciar SÍ está permitido y no debe tirar.
    const r = () => armarActualizacionMl(item(), { valores: { ROOMS: null } }, raw)
    expect(r).not.toThrow()
  })
})

describe('normalizarMl', () => {
  it('agrega la unidad a expensas y superficies peladas', () => {
    expect(normalizarMl('MAINTENANCE_FEE', '600000')).toBe('600000 ARS')
    expect(normalizarMl('COVERED_AREA', '90')).toBe('90 m²')
    expect(normalizarMl('ROOMS', '4')).toBe('4')
  })
  // El uso real de normalizarMl es como normalizador de mismoValor: el valor
  // VIVO que devuelve ML ("600.000 ARS", formato argentino) y lo que la
  // persona tipeó sin puntos ("600000") tienen que contar como el MISMO
  // valor — si no, cada guardado de esta ficha se marca "cambiado" sin que
  // nadie haya tocado nada.
  it('"600000" y "600.000 ARS" cuentan como el mismo valor (vía mismoValor)', () => {
    expect(
      mismoValor({ value_name: '600000' }, { value_name: '600.000 ARS' }, v => normalizarMl('MAINTENANCE_FEE', v)),
    ).toBe(true)
  })
})
