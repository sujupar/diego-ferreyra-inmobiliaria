import { describe, it, expect } from 'vitest'
import { nextStateFor, isPipelineState, PIPELINE_STATES, PIPELINE_STATE_LABELS } from './pipeline-state'

describe('nextStateFor — avance', () => {
  it('nuevo + first_outbound_message → contactado', () => {
    expect(nextStateFor('nuevo', 'first_outbound_message')).toBe('contactado')
  })

  it('nuevo + visit_scheduled → visita_agendada (puede agendarse una visita sin haber mandado mensaje)', () => {
    expect(nextStateFor('nuevo', 'visit_scheduled')).toBe('visita_agendada')
  })

  it('contactado + visit_scheduled → visita_agendada', () => {
    expect(nextStateFor('contactado', 'visit_scheduled')).toBe('visita_agendada')
  })

  it('visita_agendada + visit_completed → visito', () => {
    expect(nextStateFor('visita_agendada', 'visit_completed')).toBe('visito')
  })

  it('nuevo + visit_completed → visito (salto directo, la escalera no exige pasar por todos los escalones)', () => {
    expect(nextStateFor('nuevo', 'visit_completed')).toBe('visito')
  })
})

describe('nextStateFor — nunca retrocede', () => {
  it('visito + first_outbound_message no lo devuelve a contactado', () => {
    expect(nextStateFor('visito', 'first_outbound_message')).toBeNull()
  })

  it('visito + visit_scheduled no lo devuelve a visita_agendada', () => {
    expect(nextStateFor('visito', 'visit_scheduled')).toBeNull()
  })

  it('visita_agendada + first_outbound_message no lo devuelve a contactado', () => {
    expect(nextStateFor('visita_agendada', 'first_outbound_message')).toBeNull()
  })
})

describe('nextStateFor — idempotencia', () => {
  it('contactado + first_outbound_message (segunda vez) no cambia nada', () => {
    expect(nextStateFor('contactado', 'first_outbound_message')).toBeNull()
  })

  it('visita_agendada + visit_scheduled (segunda vez, ej. reprogramación) no cambia nada', () => {
    expect(nextStateFor('visita_agendada', 'visit_scheduled')).toBeNull()
  })

  it('visito + visit_completed (segunda vez) no cambia nada', () => {
    expect(nextStateFor('visito', 'visit_completed')).toBeNull()
  })
})

describe('nextStateFor — estados manuales quedan fuera de la escalera automática', () => {
  it('negociando no se mueve con ningún evento automático', () => {
    expect(nextStateFor('negociando', 'first_outbound_message')).toBeNull()
    expect(nextStateFor('negociando', 'visit_scheduled')).toBeNull()
    expect(nextStateFor('negociando', 'visit_completed')).toBeNull()
  })

  it('cerrado no se mueve con ningún evento automático', () => {
    expect(nextStateFor('cerrado', 'first_outbound_message')).toBeNull()
    expect(nextStateFor('cerrado', 'visit_scheduled')).toBeNull()
    expect(nextStateFor('cerrado', 'visit_completed')).toBeNull()
  })

  it('perdido no se mueve con ningún evento automático (ni un mensaje nuevo lo "reabre")', () => {
    expect(nextStateFor('perdido', 'first_outbound_message')).toBeNull()
    expect(nextStateFor('perdido', 'visit_scheduled')).toBeNull()
    expect(nextStateFor('perdido', 'visit_completed')).toBeNull()
  })
})

describe('isPipelineState', () => {
  it('acepta los 7 estados del enum', () => {
    for (const s of PIPELINE_STATES) expect(isPipelineState(s)).toBe(true)
  })

  it('rechaza texto arbitrario', () => {
    expect(isPipelineState('en_negociacion')).toBe(false)
    expect(isPipelineState('')).toBe(false)
    expect(isPipelineState('Nuevo')).toBe(false) // case-sensitive: el enum de la base es minúsculas
  })
})

describe('PIPELINE_STATE_LABELS', () => {
  it('tiene un rótulo para cada estado, sin huecos', () => {
    for (const s of PIPELINE_STATES) {
      expect(typeof PIPELINE_STATE_LABELS[s]).toBe('string')
      expect(PIPELINE_STATE_LABELS[s].length).toBeGreaterThan(0)
    }
  })
})
