import { describe, it, expect } from 'vitest'
import { windowUrgency, computePriority, type AiPriorityInput } from './priority'
import type { ServiceWindowResult } from './window'

const OPEN_23H_LEFT: ServiceWindowResult = { open: true, msRemaining: 23 * 60 * 60 * 1000 }
const OPEN_1H_LEFT: ServiceWindowResult = { open: true, msRemaining: 60 * 60 * 1000 }
const OPEN_10MIN_LEFT: ServiceWindowResult = { open: true, msRemaining: 10 * 60 * 1000 }
const CLOSED: ServiceWindowResult = { open: false, msRemaining: 0 }

describe('windowUrgency', () => {
  it('ventana cerrada da 0 (no hay nada "por cerrar")', () => {
    expect(windowUrgency(CLOSED)).toBe(0)
  })

  it('ventana recién abierta (24h completas) da ~0', () => {
    expect(windowUrgency({ open: true, msRemaining: 24 * 60 * 60 * 1000 })).toBe(0)
  })

  it('a punto de cerrar (10 min de 24h) da un número alto', () => {
    expect(windowUrgency(OPEN_10MIN_LEFT)).toBeGreaterThan(90)
  })

  it('a mitad de ventana da ~50', () => {
    expect(windowUrgency({ open: true, msRemaining: 12 * 60 * 60 * 1000 })).toBe(50)
  })
})

describe('computePriority — sin IA (degrada con elegancia)', () => {
  it('sin análisis, el score es SOLO la urgencia de ventana', () => {
    const r = computePriority(OPEN_1H_LEFT, null)
    expect(r.score).toBe(windowUrgency(OPEN_1H_LEFT))
    expect(r.analyzed).toBe(false)
  })

  it('sin análisis, siempre hay un motivo (nunca vacío)', () => {
    const r = computePriority(OPEN_1H_LEFT, null)
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('sin análisis y ventana cerrada, el motivo lo explica', () => {
    const r = computePriority(CLOSED, null)
    expect(r.reason).toContain('cerró')
    expect(r.score).toBe(0)
  })

  it('sin análisis, NO parece "prioridad cero" cuando la ventana igual apremia', () => {
    const r = computePriority(OPEN_10MIN_LEFT, null)
    expect(r.score).toBeGreaterThan(90)
    expect(r.analyzed).toBe(false)
  })
})

describe('computePriority — con IA', () => {
  const agendarAlto: AiPriorityInput = { intent: 'agendar', priorityScore: 90, priorityReason: 'Pidió agendar una visita para el finde' }

  it('combina windowUrgency + priorityScore (50/50)', () => {
    const r = computePriority(OPEN_1H_LEFT, agendarAlto)
    const expected = Math.round(0.5 * windowUrgency(OPEN_1H_LEFT) + 0.5 * 90)
    expect(r.score).toBe(expected)
    expect(r.analyzed).toBe(true)
  })

  it('el motivo combina la razón de la IA con el estado ACTUAL de la ventana', () => {
    const r = computePriority(OPEN_1H_LEFT, agendarAlto)
    expect(r.reason).toContain('Pidió agendar una visita para el finde')
    expect(r.reason).toContain('ventana')
  })

  it('sin priority_reason, cae a una frase corta derivada del intent', () => {
    const r = computePriority(OPEN_1H_LEFT, { intent: 'agendar', priorityScore: 80, priorityReason: null })
    expect(r.reason).toContain('Pidió agendar una visita')
  })

  it('priorityScore fuera de rango se clampea a 0-100 (defensivo)', () => {
    const r = computePriority(CLOSED, { intent: 'consulta', priorityScore: 500, priorityReason: null })
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('un intent desconocido no revienta', () => {
    const r = computePriority(OPEN_23H_LEFT, { intent: 'desconocido', priorityScore: 10, priorityReason: null })
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('la razón guardada de la IA con punto final no queda con doble puntuación rara', () => {
    const r = computePriority(OPEN_1H_LEFT, { intent: 'agendar', priorityScore: 70, priorityReason: 'Quiere visitar mañana.' })
    expect(r.reason).not.toContain('.  y')
    expect(r.reason).not.toContain('. y')
  })
})
