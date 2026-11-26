import { describe, it, expect } from 'vitest'
import {
  ETAPAS_CERRADAS,
  elegirDealActivo,
  situacionProceso,
  puedeConvertirSolicitud,
  motivoNoConvertir,
  esProcesoPropio,
  puedeCerrarProceso,
} from './deal-activo'

const d = (id: string, stage: string, created_at: string) => ({ id, stage, created_at })

describe('elegirDealActivo', () => {
  it('sin procesos devuelve null', () => {
    expect(elegirDealActivo([])).toBeNull()
  })
  it('con todos los procesos cerrados devuelve null', () => {
    expect(
      elegirDealActivo([
        d('a', 'captured', '2026-01-01T00:00:00Z'),
        d('b', 'lost', '2026-02-01T00:00:00Z'),
        d('c', 'comprador', '2026-03-01T00:00:00Z'),
      ]),
    ).toBeNull()
  })
  it('si el más nuevo está cerrado, devuelve el viejo abierto', () => {
    expect(
      elegirDealActivo([
        d('viejo', 'followup', '2026-01-01T00:00:00Z'),
        d('nuevo', 'lost', '2026-05-01T00:00:00Z'),
      ])?.id,
    ).toBe('viejo')
  })
  it('con dos abiertos gana el más reciente', () => {
    expect(
      elegirDealActivo([
        d('viejo', 'scheduled', '2026-01-01T00:00:00Z'),
        d('nuevo', 'visited', '2026-05-01T00:00:00Z'),
      ])?.id,
    ).toBe('nuevo')
  })
  it('con dos solicitudes abiertas gana la más nueva', () => {
    expect(
      elegirDealActivo([
        d('nueva', 'request', '2026-06-01T00:00:00Z'),
        d('vieja', 'request', '2026-01-01T00:00:00Z'),
      ])?.id,
    ).toBe('nueva')
  })
  it('una solicitud abierta y un proceso de clase más nuevo: gana el de la clase', () => {
    expect(
      elegirDealActivo([
        d('solicitud', 'request', '2026-01-01T00:00:00Z'),
        d('clase', 'clase_gratuita', '2026-02-01T00:00:00Z'),
      ])?.id,
    ).toBe('clase')
  })
  it('una etapa desconocida cuenta como abierta', () => {
    expect(elegirDealActivo([d('raro', 'etapa_nueva', '2026-01-01T00:00:00Z')])?.id).toBe('raro')
  })
  it('las etapas cerradas son captada, descartado y comprador', () => {
    expect([...ETAPAS_CERRADAS]).toEqual(['captured', 'lost', 'comprador'])
  })
})

describe('situacionProceso', () => {
  const p = (stage: string, scheduled_date: string | null = null, origin: string | null = null) => ({
    stage,
    scheduled_date,
    origin,
  })
  it('sin proceso → sin_proceso', () => {
    expect(situacionProceso(null)).toBe('sin_proceso')
  })
  it('request → solicitud', () => {
    expect(situacionProceso(p('request'))).toBe('solicitud')
  })
  it('scheduled sin día → solicitud', () => {
    expect(situacionProceso(p('scheduled'))).toBe('solicitud')
  })
  it('scheduled con día → coordinada_o_posterior', () => {
    expect(situacionProceso(p('scheduled', '2026-12-01'))).toBe('coordinada_o_posterior')
  })
  it('clase_gratuita → clase_gratuita', () => {
    expect(situacionProceso(p('clase_gratuita'))).toBe('clase_gratuita')
  })
  it('request con origen clase_gratuita → clase_gratuita', () => {
    expect(situacionProceso(p('request', null, 'clase_gratuita'))).toBe('clase_gratuita')
  })
  it('scheduled sin día con origen clase_gratuita → clase_gratuita', () => {
    expect(situacionProceso(p('scheduled', null, 'clase_gratuita'))).toBe('clase_gratuita')
  })
  it('scheduled con día y origen clase_gratuita → coordinada_o_posterior', () => {
    expect(situacionProceso(p('scheduled', '2026-12-01', 'clase_gratuita'))).toBe('coordinada_o_posterior')
  })
  it.each(['not_visited', 'visited', 'appraisal_sent', 'followup', 'etapa_desconocida'])(
    '%s → coordinada_o_posterior',
    (stage) => {
      expect(situacionProceso(p(stage, '2026-12-01'))).toBe('coordinada_o_posterior')
    },
  )
  it.each(['captured', 'lost', 'comprador'])('un proceso cerrado (%s) cuenta como sin_proceso', (stage) => {
    expect(situacionProceso(p(stage, '2026-12-01'))).toBe('sin_proceso')
  })
})

describe('motivoNoConvertir y puedeConvertirSolicitud', () => {
  const coordinadora = { id: 'coord', puedeVerTodos: true, puedeCoordinar: true }
  const asesor = { id: 'ase', puedeVerTodos: false, puedeCoordinar: true }
  const abogado = { id: 'abo', puedeVerTodos: false, puedeCoordinar: false }
  const deal = (o: Partial<{ stage: string; scheduled_date: string | null; origin: string | null; assigned_to: string | null }> = {}) => ({
    stage: 'request',
    scheduled_date: null,
    origin: null,
    assigned_to: null,
    ...o,
  })

  it('la coordinadora puede convertir una solicitud', () => {
    expect(motivoNoConvertir(coordinadora, deal())).toBeNull()
    expect(puedeConvertirSolicitud(coordinadora, deal())).toBe(true)
  })
  it('el asesor puede convertir su propia solicitud', () => {
    expect(puedeConvertirSolicitud(asesor, deal({ assigned_to: 'ase' }))).toBe(true)
  })
  it('el asesor no puede convertir una solicitud ajena', () => {
    expect(motivoNoConvertir(asesor, deal({ assigned_to: 'otro' }))).toBe('sin_permiso')
    expect(puedeConvertirSolicitud(asesor, deal({ assigned_to: 'otro' }))).toBe(false)
  })
  it('el asesor no puede convertir una solicitud sin asesor', () => {
    expect(motivoNoConvertir(asesor, deal({ assigned_to: null }))).toBe('sin_permiso')
  })
  it('sin permiso de coordinar → sin_permiso', () => {
    expect(motivoNoConvertir(abogado, deal())).toBe('sin_permiso')
  })
  it('scheduled sin día también se convierte', () => {
    expect(motivoNoConvertir(coordinadora, deal({ stage: 'scheduled' }))).toBeNull()
  })
  it('asesor sobre un proceso ajeno ya coordinado → sin_permiso (gana el permiso)', () => {
    expect(
      motivoNoConvertir(asesor, deal({ stage: 'scheduled', scheduled_date: '2026-12-01', assigned_to: 'otro' })),
    ).toBe('sin_permiso')
  })
  it('asesor sobre un proceso ajeno de la clase → sin_permiso', () => {
    expect(motivoNoConvertir(asesor, deal({ origin: 'clase_gratuita', assigned_to: 'otro' }))).toBe('sin_permiso')
  })
  it('coordinadora sobre un proceso de origen clase_gratuita → clase_gratuita', () => {
    expect(motivoNoConvertir(coordinadora, deal({ origin: 'clase_gratuita' }))).toBe('clase_gratuita')
    expect(puedeConvertirSolicitud(coordinadora, deal({ origin: 'clase_gratuita' }))).toBe(false)
  })
  it('coordinadora sobre un proceso en etapa clase_gratuita → clase_gratuita', () => {
    expect(motivoNoConvertir(coordinadora, deal({ stage: 'clase_gratuita' }))).toBe('clase_gratuita')
  })
  it('coordinadora sobre un proceso en Coordinada con día → ya_cambio_de_etapa', () => {
    expect(motivoNoConvertir(coordinadora, deal({ stage: 'scheduled', scheduled_date: '2026-12-01' }))).toBe(
      'ya_cambio_de_etapa',
    )
  })
  it('coordinadora sobre un proceso descartado → ya_cambio_de_etapa', () => {
    expect(motivoNoConvertir(coordinadora, deal({ stage: 'lost' }))).toBe('ya_cambio_de_etapa')
  })
  it('puedeConvertirSolicitud es verdadero exactamente cuando el motivo es null', () => {
    const usuarios = [coordinadora, asesor, abogado]
    const deals = [
      deal(),
      deal({ assigned_to: 'ase' }),
      deal({ assigned_to: 'otro' }),
      deal({ stage: 'scheduled' }),
      deal({ stage: 'scheduled', scheduled_date: '2026-12-01', assigned_to: 'ase' }),
      deal({ origin: 'clase_gratuita', assigned_to: 'ase' }),
      deal({ stage: 'clase_gratuita' }),
      deal({ stage: 'followup', assigned_to: 'ase' }),
    ]
    for (const u of usuarios) {
      for (const p of deals) {
        expect(puedeConvertirSolicitud(u, p)).toBe(motivoNoConvertir(u, p) === null)
      }
    }
  })
})

describe('esProcesoPropio y puedeCerrarProceso', () => {
  const casos: { nombre: string; role: string; assigned_to: string | null; esperado: boolean }[] = [
    { nombre: 'admin', role: 'admin', assigned_to: 'otro', esperado: true },
    { nombre: 'dueño', role: 'dueno', assigned_to: 'otro', esperado: true },
    { nombre: 'coordinador', role: 'coordinador', assigned_to: null, esperado: true },
    { nombre: 'asesor con proceso propio', role: 'asesor', assigned_to: 'yo', esperado: true },
    { nombre: 'asesor con proceso ajeno', role: 'asesor', assigned_to: 'otro', esperado: false },
    { nombre: 'asesor con proceso sin asesor', role: 'asesor', assigned_to: null, esperado: false },
    { nombre: 'abogado', role: 'abogado', assigned_to: 'yo', esperado: false },
    { nombre: 'agent', role: 'agent', assigned_to: 'yo', esperado: false },
    { nombre: 'viewer', role: 'viewer', assigned_to: 'yo', esperado: false },
    { nombre: 'rol inventado', role: 'supervisor', assigned_to: 'yo', esperado: false },
  ]
  it.each(casos)('esProcesoPropio: $nombre → $esperado', ({ role, assigned_to, esperado }) => {
    expect(esProcesoPropio({ id: 'yo', role }, { assigned_to })).toBe(esperado)
  })
  it.each(casos)('puedeCerrarProceso con pipeline.advance: $nombre → $esperado', ({ role, assigned_to, esperado }) => {
    expect(puedeCerrarProceso({ id: 'yo', role, puedeAvanzar: true }, { assigned_to })).toBe(esperado)
  })
  it('sin pipeline.advance nadie cierra, ni el admin', () => {
    expect(puedeCerrarProceso({ id: 'yo', role: 'admin', puedeAvanzar: false }, { assigned_to: 'yo' })).toBe(false)
  })
  it('el asesor con id vacío no toma como propio un proceso sin asesor', () => {
    expect(esProcesoPropio({ id: '', role: 'asesor' }, { assigned_to: null })).toBe(false)
  })
})
