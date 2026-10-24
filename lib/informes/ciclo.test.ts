import { describe, expect, it } from 'vitest'
import { entraEnElCiclo, periodoDelCiclo, proximasFuentes, tandaParaAvisar, type InformeDelCiclo } from './ciclo'

const prop = { id: 'p', titulo: 'Depto 2 amb', status: 'approved', commercialStatus: 'disponible' }

describe('entraEnElCiclo (spec: captada, disponible o reservada)', () => {
  it('captada y disponible o reservada → sí', () => {
    expect(entraEnElCiclo(prop)).toBe(true)
    expect(entraEnElCiclo({ ...prop, commercialStatus: 'reservada' })).toBe(true)
  })
  it('sin estado comercial cargado cuenta como disponible (es el default de la columna)', () => {
    expect(entraEnElCiclo({ ...prop, commercialStatus: null })).toBe(true)
  })
  it('vendida, dada de baja, descartada o sin captar → no', () => {
    for (const c of ['vendida', 'dada_de_baja', 'descartada']) expect(entraEnElCiclo({ ...prop, commercialStatus: c })).toBe(false)
    expect(entraEnElCiclo({ ...prop, status: 'pending_review' })).toBe(false)
  })
  it('las fichas de prueba no generan informes ni tareas para Paula', () => {
    expect(entraEnElCiclo({ ...prop, titulo: '[TEST EDITAR-AVISO] Depto' })).toBe(false)
    expect(entraEnElCiclo({ ...prop, titulo: '  [test] algo' })).toBe(false)
  })
})

describe('periodoDelCiclo', () => {
  it('el 1 cierra del 16 al fin del mes anterior; el 16, del 1 al 15', () => {
    expect(periodoDelCiclo('2026-11-01', null)).toEqual({ desde: '2026-10-16', hasta: '2026-10-31' })
    expect(periodoDelCiclo('2026-10-16', null)).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' })
  })
  it('el día de repechaje (2 y 17) da el MISMO período que el día del ciclo', () => {
    expect(periodoDelCiclo('2026-11-02', null)).toEqual(periodoDelCiclo('2026-11-01', null))
    expect(periodoDelCiclo('2026-10-17', null)).toEqual(periodoDelCiclo('2026-10-16', null))
  })
  it('captada a mitad de quincena arranca ese día; captada después del cierre, no tiene informe', () => {
    expect(periodoDelCiclo('2026-10-16', '2026-10-09')).toEqual({ desde: '2026-10-09', hasta: '2026-10-15' })
    expect(periodoDelCiclo('2026-10-16', '2026-10-16')).toBeNull()
  })
})

const inf = (id: string, pendientes: InformeDelCiclo['pendientes'], extra: Partial<InformeDelCiclo> = {}): InformeDelCiclo =>
  ({ id, propertyId: `p-${id}`, creadoEn: '2026-11-01T09:00:00Z', avisadoEn: null, pendientes, ...extra })

describe('proximasFuentes', () => {
  it('completa un informe entero antes de pasar al siguiente (así quedan listos de a uno)', () => {
    const r = proximasFuentes([inf('a', ['consultas', 'visitas']), inf('b', ['consultas'])], 3)
    expect(r).toEqual([{ informeId: 'a', fuente: 'consultas' }, { informeId: 'a', fuente: 'visitas' }, { informeId: 'b', fuente: 'consultas' }])
  })
  it('respeta el máximo y no devuelve nada si no hay pendientes', () => {
    expect(proximasFuentes([inf('a', ['consultas', 'visitas', 'meta'])], 2)).toHaveLength(2)
    expect(proximasFuentes([inf('a', [])], 5)).toEqual([])
  })
})

describe('tandaParaAvisar (UN email por tanda, no uno por propiedad)', () => {
  const ahora = new Date('2026-11-01T10:00:00Z')
  it('mientras algún informe de la tanda tenga fuentes pendientes, todavía no se avisa', () => {
    expect(tandaParaAvisar([inf('a', []), inf('b', ['meta'])], ahora)).toEqual({ avisar: [], motivo: 'faltan_fuentes' })
  })
  it('un informe ya avisado con fuentes pendientes no traba el aviso de los nuevos', () => {
    expect(tandaParaAvisar([inf('a', ['meta'], { avisadoEn: 'x' }), inf('b', [])], ahora)).toEqual({ avisar: ['b'], motivo: 'tanda_completa' })
  })
  it('cuando ninguno tiene pendientes, se avisan todos los que no se avisaron', () => {
    expect(tandaParaAvisar([inf('a', []), inf('b', [], { avisadoEn: '2026-11-01T09:30:00Z' })], ahora))
      .toEqual({ avisar: ['a'], motivo: 'tanda_completa' })
  })
  it('a las 6 horas se avisa igual: una fuente trabada no deja a Paula sin aviso (el editor la vuelve a traer)', () => {
    const tarde = new Date('2026-11-01T15:01:00Z')
    expect(tandaParaAvisar([inf('a', []), inf('b', ['meta'])], tarde)).toEqual({ avisar: ['a', 'b'], motivo: 'tiempo_cumplido' })
  })
  it('las 6 horas se cuentan desde los informes SIN avisar: uno nuevo del día 2 no sale avisado vacío', () => {
    const dia2 = new Date('2026-11-02T10:00:00Z')
    const viejo = inf('a', [], { creadoEn: '2026-11-01T09:00:00Z', avisadoEn: '2026-11-01T10:00:00Z' })
    const nuevo = inf('b', ['meta'], { creadoEn: '2026-11-02T09:58:00Z' })
    expect(tandaParaAvisar([viejo, nuevo], dia2)).toEqual({ avisar: [], motivo: 'faltan_fuentes' })
  })
  it('si ya se avisó todo, o no hay informes, no hay nada que hacer', () => {
    expect(tandaParaAvisar([inf('a', [], { avisadoEn: 'x' })], ahora)).toEqual({ avisar: [], motivo: 'ya_avisado' })
    expect(tandaParaAvisar([], ahora)).toEqual({ avisar: [], motivo: 'sin_informes' })
  })
})
