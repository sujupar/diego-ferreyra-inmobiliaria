import { describe, it, expect } from 'vitest'
import { diferenciasMl, diferenciasAp, type FichaComercial } from './diferencias-con-ficha'

const fichaDepto: FichaComercial = { property_type: 'departamento', operation_type: 'venta', asking_price: 79000, currency: 'USD' }

describe('diferenciasMl', () => {
  const vivo = { category_id: 'MLA401686', price: 79000, currency_id: 'USD' }

  it('igual → nada', () => {
    expect(diferenciasMl(fichaDepto, vivo)).toEqual({ portal: 'mercadolibre', diferencias: [], accion: 'nada' })
  })
  it('depto → casa: solo tipo, se actualiza en el lugar', () => {
    const r = diferenciasMl({ ...fichaDepto, property_type: 'casa' }, vivo)
    expect(r.diferencias).toEqual([{ campo: 'tipo', antes: 'Departamento', despues: 'Casa' }])
    expect(r.accion).toBe('actualizar')
  })
  it('venta → alquiler: solo operación', () => {
    const r = diferenciasMl({ ...fichaDepto, operation_type: 'alquiler' }, vivo)
    expect(r.diferencias).toEqual([{ campo: 'operacion', antes: 'Venta', despues: 'Alquiler' }])
    expect(r.accion).toBe('actualizar')
  })
  it('precio 79000 → 75000', () => {
    const r = diferenciasMl({ ...fichaDepto, asking_price: 75000 }, vivo)
    expect(r.diferencias).toEqual([{ campo: 'precio', antes: 'USD 79.000', despues: 'USD 75.000' }])
  })
  it('moneda USD → ARS es diferencia de precio', () => {
    const r = diferenciasMl({ ...fichaDepto, currency: 'ARS' }, vivo)
    expect(r.diferencias.map(d => d.campo)).toEqual(['precio'])
  })
  it('categoría viva fuera del mapa → tipo "Otra categoría"', () => {
    const r = diferenciasMl(fichaDepto, { ...vivo, category_id: 'MLA999' })
    expect(r.diferencias[0]).toEqual({ campo: 'tipo', antes: 'Otra categoría', despues: 'Departamento' })
  })
})

describe('diferenciasAp', () => {
  const vivo = { tipo: 'DEPARTAMENTO', subtipo: null, operacion: 'VENTA', monto: 79000, moneda: 'USD' }

  it('igual → nada', () => {
    expect(diferenciasAp(fichaDepto, vivo).accion).toBe('nada')
  })
  it('tipo distinto → republicar', () => {
    const r = diferenciasAp({ ...fichaDepto, property_type: 'casa' }, vivo)
    expect(r.diferencias).toEqual([{ campo: 'tipo', antes: 'Departamento', despues: 'Casa' }])
    expect(r.accion).toBe('republicar')
  })
  it('operación distinta → actualizar', () => {
    const r = diferenciasAp({ ...fichaDepto, operation_type: 'alquiler' }, vivo)
    expect(r.diferencias).toEqual([{ campo: 'operacion', antes: 'Venta', despues: 'Alquiler' }])
    expect(r.accion).toBe('actualizar')
  })
  it('solo precio → actualizar', () => {
    const r = diferenciasAp({ ...fichaDepto, asking_price: 75000 }, vivo)
    expect(r.diferencias).toEqual([{ campo: 'precio', antes: 'USD 79.000', despues: 'USD 75.000' }])
    expect(r.accion).toBe('actualizar')
  })
  it('subtipo vacío no es diferencia', () => {
    expect(diferenciasAp(fichaDepto, { ...vivo, subtipo: '' }).accion).toBe('nada')
  })
  it('PH (DEPARTAMENTO + subtipo PH) con ficha ph → nada', () => {
    const r = diferenciasAp({ ...fichaDepto, property_type: 'ph' }, { ...vivo, subtipo: 'PH' })
    expect(r.accion).toBe('nada')
  })
  it('tipo comparado sin mayúsculas', () => {
    expect(diferenciasAp(fichaDepto, { ...vivo, tipo: 'departamento' }).accion).toBe('nada')
  })
  it('tipo y operación a la vez → republicar con ambas', () => {
    const r = diferenciasAp({ ...fichaDepto, property_type: 'casa', operation_type: 'alquiler' }, vivo)
    expect(r.diferencias.map(d => d.campo)).toEqual(['tipo', 'operacion'])
    expect(r.accion).toBe('republicar')
  })
})
