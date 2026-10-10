import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  accionesDisponibles, aplicarAccion, pasoSinResultado, MOTIVOS_NO_REALIZADA, INTERESES,
  type VisitaParaAccion,
} from './transiciones'

const AHORA = new Date('2026-10-10T15:00:00Z') // 12:00 en Argentina
const futura = (status: VisitaParaAccion['status']): VisitaParaAccion =>
  ({ status, scheduled_at: '2026-10-12T14:00:00Z', advisor_id: '11111111-1111-4111-8111-111111111111' })
const pasada = (status: VisitaParaAccion['status']): VisitaParaAccion =>
  ({ status, scheduled_at: '2026-10-09T20:30:00Z', advisor_id: '11111111-1111-4111-8111-111111111111' })

describe('accionesDisponibles', () => {
  it('a confirmar y futura: confirmar, reprogramar, cancelar, cambiar asesor', () => {
    expect(accionesDisponibles(futura('pending_confirmation'), AHORA))
      .toEqual(['confirmar', 'reprogramar', 'cancelar', 'cambiar_asesor'])
  })
  it('confirmada y futura: no se puede marcar resultado todavía', () => {
    expect(accionesDisponibles(futura('scheduled'), AHORA)).toEqual(['reprogramar', 'cancelar', 'cambiar_asesor'])
  })
  it('confirmada que ya pasó: resultado primero, sin "cancelar"', () => {
    expect(accionesDisponibles(pasada('scheduled'), AHORA))
      .toEqual(['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'])
  })
  it('se puede marcar el resultado desde una hora antes (la visita está ocurriendo)', () => {
    const enUnRato = { ...futura('scheduled'), scheduled_at: '2026-10-10T15:45:00Z' }
    expect(accionesDisponibles(enUnRato, AHORA)).toContain('realizada')
  })
  it('una visita cerrada solo se puede reabrir', () => {
    expect(accionesDisponibles(pasada('completed'), AHORA)).toEqual(['reabrir'])
    expect(accionesDisponibles(pasada('cancelled'), AHORA)).toEqual(['reabrir'])
  })
})

describe('aplicarAccion', () => {
  it('confirmar pasa a scheduled', () => {
    expect(aplicarAccion(futura('pending_confirmation'), { tipo: 'confirmar' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'scheduled' } })
  })
  it('no se confirma algo ya confirmado', () => {
    const r = aplicarAccion(futura('scheduled'), { tipo: 'confirmar' }, AHORA)
    expect(r).toEqual({ ok: false, error: 'Esta visita ya no se puede confirmar' })
  })
  it('reprogramar valida el horario y guarda el instante en UTC', () => {
    const r = aplicarAccion(futura('scheduled'), { tipo: 'reprogramar', fecha: '2026-10-13', hora: '17:00' }, AHORA)
    expect(r).toEqual({ ok: true, patch: { scheduled_at: '2026-10-13T20:00:00.000Z' } })
  })
  it('reprogramar al mismo horario o a un horario pasado es un error', () => {
    expect(aplicarAccion(futura('scheduled'), { tipo: 'reprogramar', fecha: '2026-10-12', hora: '11:00' }, AHORA))
      .toEqual({ ok: false, error: 'Es el mismo día y horario' })
    expect(aplicarAccion(futura('scheduled'), { tipo: 'reprogramar', fecha: '2026-10-09', hora: '11:00' }, AHORA))
      .toEqual({ ok: false, error: 'Elegí un horario que todavía no pasó' })
  })
  it('cancelar exige un motivo, y "otro" exige escribirlo', () => {
    expect(aplicarAccion(futura('scheduled'), { tipo: 'cancelar', motivo: 'cancelo_persona' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'cancelled', outcome_reason: 'cancelo_persona', completion_notes: null } })
    expect(aplicarAccion(futura('scheduled'), { tipo: 'cancelar', motivo: 'otro', detalle: ' ' }, AHORA))
      .toEqual({ ok: false, error: 'Contanos el motivo' })
  })
  it('marcar "Se realizó" guarda el interés y las notas', () => {
    expect(aplicarAccion(pasada('scheduled'), { tipo: 'realizada', interes: 'alto', notas: ' Quiere volver ' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'completed', advisor_interest: 'alto', completion_notes: 'Quiere volver', outcome_reason: null } })
  })
  it('no se marca "Se realizó" una visita de pasado mañana', () => {
    expect(aplicarAccion(futura('scheduled'), { tipo: 'realizada' }, AHORA))
      .toEqual({ ok: false, error: 'Todavía no llegó el horario de la visita' })
  })
  it('"No se realizó" exige motivo', () => {
    expect(aplicarAccion(pasada('scheduled'), { tipo: 'no_realizada', motivo: 'no_vino' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'no_show', outcome_reason: 'no_vino', completion_notes: null } })
  })
  it('cambiar asesor exige uno distinto', () => {
    const v = futura('scheduled')
    expect(aplicarAccion(v, { tipo: 'cambiar_asesor', asesorId: v.advisor_id ?? '' }, AHORA))
      .toEqual({ ok: false, error: 'Ese asesor ya tiene la visita' })
    expect(aplicarAccion(v, { tipo: 'cambiar_asesor', asesorId: '22222222-2222-4222-8222-222222222222' }, AHORA))
      .toEqual({ ok: true, patch: { advisor_id: '22222222-2222-4222-8222-222222222222' } })
  })
  it('reabrir exige motivo y limpia el resultado', () => {
    expect(aplicarAccion(pasada('no_show'), { tipo: 'reabrir', motivo: 'x' }, AHORA))
      .toEqual({ ok: false, error: 'Contanos por qué la reabrís' })
    expect(aplicarAccion(pasada('no_show'), { tipo: 'reabrir', motivo: 'Lo marqué por error' }, AHORA)).toEqual({
      ok: true,
      patch: { status: 'scheduled', outcome_reason: null, advisor_interest: null, completion_notes: 'Reabierta: Lo marqué por error' },
    })
  })
})

describe('pasoSinResultado', () => {
  it('una visita viva cuyo horario ya pasó', () => {
    expect(pasoSinResultado(pasada('scheduled'), AHORA)).toBe(true)
    expect(pasoSinResultado(pasada('completed'), AHORA)).toBe(false)
    expect(pasoSinResultado(futura('scheduled'), AHORA)).toBe(false)
  })
})

// Agregado por el controlador (task-2-6: "mismo criterio que el test de orígenes: se tocan
// juntos"): MOTIVOS_NO_REALIZADA e INTERESES tienen que ser EXACTAMENTE los CHECK de la base.
describe('catálogo de motivos e interés (igual al CHECK de la base)', () => {
  const sql = readFileSync('supabase/migrations/20261010000001_visitas_origen_e_historial.sql', 'utf8')

  it('MOTIVOS_NO_REALIZADA es EXACTAMENTE la lista del CHECK property_visits_outcome_reason_check', () => {
    const m = /property_visits_outcome_reason_check\s+CHECK \(outcome_reason IS NULL OR outcome_reason IN\s*\(([^)]*)\)\)/.exec(sql)
    expect(m).not.toBeNull()
    const enLaBase = (m?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, ''))
    expect(enLaBase).toEqual([...MOTIVOS_NO_REALIZADA])
  })

  it('INTERESES es EXACTAMENTE la lista del CHECK property_visits_advisor_interest_check', () => {
    const m = /property_visits_advisor_interest_check\s+CHECK \(advisor_interest IS NULL OR advisor_interest IN\s*\(([^)]*)\)\)/.exec(sql)
    expect(m).not.toBeNull()
    const enLaBase = (m?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, ''))
    expect(enLaBase).toEqual([...INTERESES])
  })
})
