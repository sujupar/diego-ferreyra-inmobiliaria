import { describe, it, expect } from 'vitest'
import {
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
