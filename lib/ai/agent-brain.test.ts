import { describe, it, expect } from 'vitest'
import {
  buildBrainUserPrompt,
  coerceBrainDecision,
  validateProposedVisit,
  REPLY_MAX,
  SUMMARY_MAX,
  type BrainContext,
} from './agent-brain'

const HOY = '2026-08-03'

function ctx(over: Partial<BrainContext> = {}): BrainContext {
  return {
    clientName: 'Julián',
    propertyLabel: 'la casa de Lares de Canning',
    todayISO: HOY,
    previousSummary: '',
    newMessages: [{ from: 'cliente', text: 'Quiero agendar una visita' }],
    agentMessagesSent: 0,
    maxMessages: 3,
    hasActiveVisit: false,
    canWrite: true,
    ...over,
  }
}

describe('buildBrainUserPrompt', () => {
  it('le dice al modelo qué día es hoy — no lo sabe por su cuenta', () => {
    expect(buildBrainUserPrompt(ctx())).toContain(`HOY es ${HOY}`)
  })

  it('avisa cuando ya hay una visita: mover una visita coordinada la decide una persona', () => {
    expect(buildBrainUserPrompt(ctx({ hasActiveVisit: true }))).toMatch(/YA tiene una visita/)
  })

  it('avisa cuando se llegó al tope de mensajes', () => {
    const p = buildBrainUserPrompt(ctx({ agentMessagesSent: 3 }))
    expect(p).toMatch(/tope es 3/)
  })

  it('avisa cuando el agente no puede escribir (interruptor apagado): analiza igual', () => {
    expect(buildBrainUserPrompt(ctx({ canWrite: false }))).toMatch(/no le contestamos automáticamente/)
  })

  it('sin nombre, le pide explícitamente que NO lo invente', () => {
    expect(buildBrainUserPrompt(ctx({ clientName: null }))).toMatch(/no lo inventes/)
  })
})

describe('coerceBrainDecision', () => {
  const base = {
    summary: 'Julián quiere ver la casa.',
    intent: 'agendar',
    priorityScore: 90,
    priorityReason: 'Pidió coordinar una visita.',
    suggestedNextStep: 'Confirmarle el horario.',
    reply: '¿Qué día te viene bien?',
    visitDate: null,
    visitHour: null,
  }

  it('acepta una respuesta bien formada', () => {
    const d = coerceBrainDecision(base)
    expect(d?.intent).toBe('agendar')
    expect(d?.reply).toBe('¿Qué día te viene bien?')
  })

  it('null si falta lo mínimo — mejor sin análisis que con basura', () => {
    expect(coerceBrainDecision(null)).toBeNull()
    expect(coerceBrainDecision({ ...base, summary: 123 })).toBeNull()
    expect(coerceBrainDecision('texto suelto')).toBeNull()
  })

  it('un intent inventado cae en "desconocido" en vez de romper', () => {
    expect(coerceBrainDecision({ ...base, intent: 'comprarlo_ya' })?.intent).toBe('desconocido')
  })

  it('la prioridad se acota a 0-100', () => {
    expect(coerceBrainDecision({ ...base, priorityScore: 999 })?.priorityScore).toBe(100)
    expect(coerceBrainDecision({ ...base, priorityScore: -5 })?.priorityScore).toBe(0)
  })

  it('una respuesta vacía o en blanco es "no contestar", no un texto vacío', () => {
    expect(coerceBrainDecision({ ...base, reply: '   ' })?.reply).toBeNull()
    expect(coerceBrainDecision({ ...base, reply: null })?.reply).toBeNull()
  })

  it('recorta textos desbocados en vez de mandarle un ensayo al cliente', () => {
    const d = coerceBrainDecision({ ...base, reply: 'x'.repeat(2000), summary: 'y'.repeat(2000) })
    expect(d?.reply?.length).toBe(REPLY_MAX)
    expect(d?.summary.length).toBe(SUMMARY_MAX)
  })

  it('una fecha con formato raro se descarta (después la valida el código igual)', () => {
    expect(coerceBrainDecision({ ...base, visitDate: 'mañana' })?.visitDate).toBeNull()
    expect(coerceBrainDecision({ ...base, visitDate: '2026-08-04' })?.visitDate).toBe('2026-08-04')
  })
})

// El código verifica la fecha por su cuenta: el modelo propone, esto decide.
describe('validateProposedVisit', () => {
  it('acepta mañana a una hora de visita', () => {
    expect(validateProposedVisit('2026-08-04', 16, HOY)).toEqual({ ok: true, dateISO: '2026-08-04', hour: 16 })
  })

  it('rechaza HOY: la visita más temprana es mañana', () => {
    expect(validateProposedVisit(HOY, 16, HOY).ok).toBe(false)
  })

  it('rechaza el pasado', () => {
    expect(validateProposedVisit('2026-08-01', 16, HOY).ok).toBe(false)
  })

  it('rechaza una fecha que NO EXISTE (el 31 de febrero, que un modelo puede inventar)', () => {
    expect(validateProposedVisit('2026-02-31', 16, HOY).ok).toBe(false)
  })

  it('rechaza más allá de 90 días — mismo límite que el formulario público', () => {
    expect(validateProposedVisit('2027-08-04', 16, HOY).ok).toBe(false)
  })

  it('rechaza horas fuera del horario de visitas', () => {
    expect(validateProposedVisit('2026-08-04', 3, HOY).ok).toBe(false)
    expect(validateProposedVisit('2026-08-04', 23, HOY).ok).toBe(false)
  })

  it('sin día o sin hora, no se agenda nada', () => {
    expect(validateProposedVisit(null, 16, HOY).ok).toBe(false)
    expect(validateProposedVisit('2026-08-04', null, HOY).ok).toBe(false)
  })
})
