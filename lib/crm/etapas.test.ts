import { describe, it, expect } from 'vitest'
import {
  ETAPAS_CERRADAS_CARTERA,
  ETAPAS_EMBUDO,
  ETAPAS_FUERA_DEL_EMBUDO,
  NOMBRE_ETAPA,
  estaAbierto,
  etapaCRM,
  type EtapaCRM,
} from './etapas'

describe('etapaCRM', () => {
  const casos: [string, string | null, EtapaCRM][] = [
    ['request', null, 'solicitud'],
    ['scheduled', '2026-11-27', 'coordinada'],
    ['not_visited', null, 'no_realizada'],
    ['visited', '2026-11-20', 'realizada'],
    ['appraisal_sent', null, 'entregada'],
    ['followup', null, 'seguimiento'],
    ['clase_gratuita', null, 'clase_gratuita'],
    ['comprador', null, 'comprador'],
    ['captured', null, 'captada'],
    ['lost', null, 'descartado'],
  ]
  for (const [stage, dia, esperada] of casos) {
    it(`${stage}${dia ? ' con día' : ''} → ${esperada}`, () => {
      expect(etapaCRM({ stage, scheduled_date: dia })).toBe(esperada)
    })
  }
  it('coordinada sin día todavía es una solicitud (el criterio de la vieja deriveCRMStage)', () => {
    expect(etapaCRM({ stage: 'scheduled', scheduled_date: null })).toBe('solicitud')
  })
  it('una etapa desconocida cae en solicitud', () => {
    expect(etapaCRM({ stage: 'inventada', scheduled_date: null })).toBe('solicitud')
  })
  it('una etapa vacía cae en solicitud', () => {
    expect(etapaCRM({ stage: '', scheduled_date: null })).toBe('solicitud')
  })
})

describe('NOMBRE_ETAPA', () => {
  it('tiene los diez textos exactos de la spec', () => {
    expect(NOMBRE_ETAPA).toEqual({
      solicitud: 'Solicitud',
      coordinada: 'Coordinada',
      no_realizada: 'No realizada',
      realizada: 'Realizada',
      entregada: 'Entregada',
      seguimiento: 'Seguimiento',
      clase_gratuita: 'Clase gratuita',
      comprador: 'Comprador',
      captada: 'Captada',
      descartado: 'Descartado',
    })
  })
})

describe('estaAbierto', () => {
  it('Comprador cuenta como abierto en la cartera', () => {
    expect(estaAbierto('comprador')).toBe(true)
  })
  it('Captada está cerrada', () => {
    expect(estaAbierto('captada')).toBe(false)
  })
  it('Descartado está cerrado', () => {
    expect(estaAbierto('descartado')).toBe(false)
  })
  it('Solicitud y Clase gratuita están abiertas', () => {
    expect(estaAbierto('solicitud')).toBe(true)
    expect(estaAbierto('clase_gratuita')).toBe(true)
  })
})

describe('listas de etapas', () => {
  it('el embudo de tasación va de Solicitud a Seguimiento, en orden', () => {
    expect(ETAPAS_EMBUDO).toEqual(['solicitud', 'coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento'])
  })
  it('fuera del embudo: Clase gratuita y Comprador', () => {
    expect(ETAPAS_FUERA_DEL_EMBUDO).toEqual(['clase_gratuita', 'comprador'])
  })
  it('cerradas: Captada y Descartado', () => {
    expect(ETAPAS_CERRADAS_CARTERA).toEqual(['captada', 'descartado'])
  })
  it('las tres listas cubren las diez etapas sin repetir', () => {
    const todas = [...ETAPAS_EMBUDO, ...ETAPAS_FUERA_DEL_EMBUDO, ...ETAPAS_CERRADAS_CARTERA]
    expect(new Set(todas).size).toBe(10)
    expect(todas.sort()).toEqual(Object.keys(NOMBRE_ETAPA).sort())
  })
  it('las abiertas son exactamente el embudo más fuera del embudo', () => {
    const abiertas = (Object.keys(NOMBRE_ETAPA) as EtapaCRM[]).filter(estaAbierto)
    expect(abiertas.sort()).toEqual([...ETAPAS_EMBUDO, ...ETAPAS_FUERA_DEL_EMBUDO].sort())
  })
})
