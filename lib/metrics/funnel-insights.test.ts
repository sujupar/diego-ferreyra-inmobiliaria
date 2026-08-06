import { describe, it, expect } from 'vitest'
import {
  construirEstado,
  MUESTRA_MINIMA, esMuestraChica, cobertura, cuelloDeBotella,
  formatearDuracion, etiquetaEtapa, type StageTiming,
} from './funnel-insights'

const t = (desde: string, hasta: string, n: number, mediana: number): StageTiming =>
  ({ desde, hasta, n, mediana_dias: mediana, p75_dias: mediana * 1.5 })

describe('muestra chica', () => {
  it('avisa por debajo del mínimo y no avisa a partir de ahí', () => {
    expect(esMuestraChica(MUESTRA_MINIMA - 1)).toBe(true)
    expect(esMuestraChica(MUESTRA_MINIMA)).toBe(false)
    expect(esMuestraChica(0)).toBe(true)
  })
})

describe('cobertura de datos de inversión', () => {
  it('con todos los días cargados es confiable', () => {
    const c = cobertura({ dias_con_dato: 30, dias_del_periodo: 30 })
    expect(c.pct).toBe(100)
    expect(c.confiable).toBe(true)
  })

  it('con 24 de 88 días NO es confiable y lo dice en castellano', () => {
    const c = cobertura({ dias_con_dato: 24, dias_del_periodo: 88 })
    expect(c.pct).toBe(27)
    expect(c.confiable).toBe(false)
    expect(c.texto).toContain('24')
    expect(c.texto).toContain('88')
  })

  it('sin ningún día cargado avisa que no hay datos, no que sea cero', () => {
    const c = cobertura({ dias_con_dato: 0, dias_del_periodo: 31 })
    expect(c.confiable).toBe(false)
    expect(c.texto.toLowerCase()).toContain('sin datos')
  })

  it('un período de cero días no rompe', () => {
    expect(() => cobertura({ dias_con_dato: 0, dias_del_periodo: 0 })).not.toThrow()
    expect(cobertura({ dias_con_dato: 0, dias_del_periodo: 0 }).confiable).toBe(false)
  })
})

describe('cuello de botella', () => {
  it('señala el paso más lento y lo nombra en castellano', () => {
    const r = cuelloDeBotella([
      t('scheduled', 'visited', 14, 2),
      t('visited', 'appraisal_sent', 7, 6),
      t('request', 'scheduled', 30, 1),
    ])
    expect(r.masLento?.desde).toBe('visited')
    expect(r.texto).toContain('Visita realizada')
    expect(r.texto).toContain('Tasación entregada')
    expect(r.texto).toContain('6')
  })

  it('avisa cuando el paso más lento se apoya en muestra chica', () => {
    const r = cuelloDeBotella([t('visited', 'appraisal_sent', 7, 6)])
    expect(r.texto).toContain('7 casos')
  })

  it('sin datos no inventa un cuello de botella', () => {
    const r = cuelloDeBotella([])
    expect(r.masLento).toBeNull()
    expect(r.texto.toLowerCase()).toContain('sin datos')
  })

  it('ignora las transiciones a perdido: no son un paso del embudo', () => {
    const r = cuelloDeBotella([
      t('request', 'lost', 10, 40),
      t('scheduled', 'visited', 14, 2),
    ])
    expect(r.masLento?.hasta).toBe('visited')
  })
})

describe('estado de resultados', () => {
  // Los números reales del embudo 2026, para que el test hable del negocio.
  const etapas = [
    { etapa: 'request', orden: 1, cantidad: 109, mediana_dias: null },
    { etapa: 'scheduled', orden: 2, cantidad: 26, mediana_dias: 0 },
    { etapa: 'visited', orden: 3, cantidad: 14, mediana_dias: 4.1 },
    { etapa: 'appraisal_sent', orden: 4, cantidad: 7, mediana_dias: 13.4 },
    { etapa: 'captured', orden: 5, cantidad: 1, mediana_dias: 0 },
  ]

  it('calcula el costo unitario de cada etapa sobre la inversión total', () => {
    const l = construirEstado(etapas, 3_407_443)
    expect(l[0].costoUnitario).toBe(31261)   // 109 solicitudes
    expect(l[4].costoUnitario).toBe(3407443) // 1 captación
  })

  it('calcula cuánto convierte cada paso y cuántos se pierden', () => {
    const l = construirEstado(etapas, 3_407_443)
    expect(l[0].conversionPct).toBeNull()  // la primera no viene de ninguna
    expect(l[1].conversionPct).toBe(24)    // 26 de 109
    expect(l[1].perdidos).toBe(83)
    expect(l[2].conversionPct).toBe(54)    // 14 de 26
  })

  it('marca como cuello de botella el PEOR salto, no la etapa con menos gente', () => {
    const l = construirEstado(etapas, 3_407_443)
    const cuello = l.find(x => x.esCuelloDeBotella)
    // 24% (solicitud→coordinada) es peor que 14% (tasación→captada)... salvo que no:
    // el peor salto real de estos datos es 14%. El test fija la regla, no la intuición.
    expect(cuello?.etapa).toBe('captured')
    expect(cuello?.conversionPct).toBe(14)
  })

  it('sin inversión cargada no inventa un costo', () => {
    const l = construirEstado(etapas, 0)
    expect(l[0].costoUnitario).toBeNull()
  })

  it('una etapa sin nadie no divide por cero', () => {
    const l = construirEstado([
      { etapa: 'request', orden: 1, cantidad: 0, mediana_dias: null },
      { etapa: 'scheduled', orden: 2, cantidad: 0, mediana_dias: null },
    ], 1000)
    expect(l[0].costoUnitario).toBeNull()
    expect(l[1].conversionPct).toBeNull()
  })

  it('respeta el orden aunque las etapas lleguen desordenadas', () => {
    const l = construirEstado([...etapas].reverse(), 3_407_443)
    expect(l.map(x => x.etapa)).toEqual(
      ['request', 'scheduled', 'visited', 'appraisal_sent', 'captured'])
  })
})

describe('formato', () => {
  it('escribe duraciones en castellano', () => {
    expect(formatearDuracion(1)).toBe('1 día')
    expect(formatearDuracion(6)).toBe('6 días')
    expect(formatearDuracion(0.5)).toBe('menos de un día')
  })

  it('traduce las etapas y no rompe con una desconocida', () => {
    expect(etiquetaEtapa('appraisal_sent')).toBe('Tasación entregada')
    expect(etiquetaEtapa('captured')).toBe('Captada')
    expect(etiquetaEtapa('cualquier_cosa')).toBe('cualquier_cosa')
  })
})
