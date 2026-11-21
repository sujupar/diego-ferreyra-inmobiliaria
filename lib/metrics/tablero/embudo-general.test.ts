import { describe, expect, it } from 'vitest'
import { embudoGeneral } from './embudo-general'
import { totalAnuncios } from './anuncios'
import type { MetaDia, Paso } from '../panel/embudo'

const paso = (etapa: Paso['etapa'], cantidad: number): Paso => ({ etapa, cantidad, pctPaso: null, pctSolicitud: null, costoUsd: null })
const pasos = [paso('solicitud', 8), paso('agendada', 2), paso('realizada', 1), paso('entregada', 1), paso('captada', 0)]

describe('embudoGeneral: cada paso con su cantidad y el % sobre el paso anterior', () => {
  it('arma impresiones → clics → visitas → solicitudes → agendadas → hechas → captadas', () => {
    const e = embudoGeneral({ impresiones: 11_571, clics: 445, visitasMeta: 277 }, pasos)
    expect(e.map(x => x.clave)).toEqual(['impresiones', 'clics', 'visitas', 'solicitudes', 'agendadas', 'realizadas', 'captadas'])
    expect(e[0].pct).toBeNull()
    expect(e[1].pct).toBeCloseTo(445 / 11_571)
    expect(e[2].pct).toBeCloseTo(277 / 445)
    expect(e[3]).toMatchObject({ cantidad: 8, pct: 8 / 277 })
    expect(e[4]).toMatchObject({ cantidad: 2, pct: 0.25 })
    expect(e[5]).toMatchObject({ cantidad: 1, pct: 0.5 })
    // Captadas va contra las tasaciones HECHAS (la entrega del informe no es un paso del embudo general).
    expect(e[6]).toMatchObject({ cantidad: 0, pct: 0 })
  })
  it('sin dato de Meta, los pasos de Meta quedan sin dato y las solicitudes sin %', () => {
    const e = embudoGeneral(null, pasos)
    expect(e[0].cantidad).toBeNull()
    expect(e[2].cantidad).toBeNull()
    expect(e[3]).toMatchObject({ cantidad: 8, pct: null })
  })
  it('un paso anterior en 0 deja el % sin dato, nunca 0', () => {
    const e = embudoGeneral({ impresiones: 100, clics: 0, visitasMeta: 0 }, [paso('solicitud', 0), paso('agendada', 0), paso('realizada', 0), paso('entregada', 0), paso('captada', 0)])
    expect(e[2].pct).toBeNull()
    expect(e[4].pct).toBeNull()
  })
})

describe('totalAnuncios en dólares', () => {
  const m = (fecha: string, gasto: number, extra: Partial<MetaDia> = {}): MetaDia => ({ fecha, campaniaId: 'c1', campania: 'Tasación', gasto, impresiones: 1000, clics: 40, visitasMeta: 20, registros: 1, ...extra })
  it('pasa cada día a USD con el blue de ese día y suma impresiones y clics', () => {
    const blue = (f: string) => (f === '2026-11-01' ? 1500 : 1600)
    const t = totalAnuncios([m('2026-11-01', 15_000), m('2026-11-02', 16_000)], { desde: '2026-11-01', hasta: '2026-11-02' }, 'tasacion', blue)
    expect(t).toMatchObject({ gasto: 31_000, gastoUsd: 20, impresiones: 2000, clics: 80, visitas: 40, registros: 2, costoPorRegistro: 15_500, costoPorRegistroUsd: 10 })
  })
  it('sin blue para algún día, el USD queda sin dato (no se inventa)', () => {
    const t = totalAnuncios([m('2026-11-01', 15_000)], { desde: '2026-11-01', hasta: '2026-11-01' }, 'tasacion', () => null)
    expect(t?.gastoUsd).toBeNull()
    expect(t?.costoPorRegistroUsd).toBeNull()
  })
})
