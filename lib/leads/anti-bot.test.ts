import { describe, it, expect } from 'vitest'
import {
  issueLeadTicket,
  isValidLeadTicket,
  detectFillerLeadData,
  evaluateLeadSubmission,
} from './anti-bot'

describe('issueLeadTicket / isValidLeadTicket', () => {
  it('un ticket recién emitido es válido', () => {
    const t = issueLeadTicket()
    expect(isValidLeadTicket(t)).toBe(true)
  })

  it('un ticket vencido (TTL 30 min) deja de ser válido', () => {
    const now = Date.now()
    const t = issueLeadTicket(now)
    // 31 minutos después
    expect(isValidLeadTicket(t, now + 31 * 60_000)).toBe(false)
    // justo antes de vencer sigue OK
    expect(isValidLeadTicket(t, now + 29 * 60_000)).toBe(true)
  })

  it('rechaza null/undefined/vacío sin lanzar', () => {
    expect(isValidLeadTicket(null)).toBe(false)
    expect(isValidLeadTicket(undefined)).toBe(false)
    expect(isValidLeadTicket('')).toBe(false)
  })

  it('rechaza un ticket mal formado o con firma adulterada, sin lanzar', () => {
    expect(isValidLeadTicket('basura')).toBe(false)
    expect(isValidLeadTicket('123.')).toBe(false)
    expect(isValidLeadTicket('.abc')).toBe(false)
    const t = issueLeadTicket()
    const [exp] = t.split('.')
    expect(isValidLeadTicket(`${exp}.${'0'.repeat(64)}`)).toBe(false) // firma que no matchea
    expect(isValidLeadTicket(`${exp}.corta`)).toBe(false) // longitud distinta a la firma real
  })

  it('el secreto sale de CRON_SECRET si existe (mismo secreto que ya protege los crons)', () => {
    const original = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'un-secreto-de-test'
    try {
      const t = issueLeadTicket()
      expect(isValidLeadTicket(t)).toBe(true)
    } finally {
      if (original === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = original
    }
  })
})

describe('detectFillerLeadData', () => {
  it('detecta el bot real de la auditoría (A4): "John Doe" + su email + su teléfono', () => {
    const reason = detectFillerLeadData({
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+54 11 1234 5678',
    })
    expect(reason).not.toBeNull()
    expect(reason).toMatch(/John Doe/i)
  })

  it('detecta variantes de mayúsculas y espacios extra (el patrón usa \\s+, no un separador fijo)', () => {
    expect(detectFillerLeadData({ name: '  john   doe ' })).not.toBeNull()
    expect(detectFillerLeadData({ name: 'JOHN DOE' })).not.toBeNull()
    expect(detectFillerLeadData({ name: 'Jane Doe' })).not.toBeNull()
  })

  it('un email de relleno solo (nombre real) también marca', () => {
    expect(detectFillerLeadData({ name: 'Julián Parra', email: 'test@test.com' })).not.toBeNull()
  })

  it('un teléfono que termina en 1234 5678 marca, sin importar el separador', () => {
    expect(detectFillerLeadData({ name: 'Julián Parra', phone: '+54 11 1234 5678' })).not.toBeNull()
    expect(detectFillerLeadData({ name: 'Julián Parra', phone: '541112345678' })).not.toBeNull()
    expect(detectFillerLeadData({ name: 'Julián Parra', phone: '11-1234-5678' })).not.toBeNull()
  })

  it('un lead real y normal no marca nada', () => {
    expect(
      detectFillerLeadData({ name: 'Julián Parra', email: 'julian@gmail.com', phone: '+54 11 6123 4567' }),
    ).toBeNull()
  })

  it('sin nombre/email/teléfono no explota', () => {
    expect(detectFillerLeadData({ name: '' })).toBeNull()
    expect(detectFillerLeadData({ name: 'Julián Parra', email: null, phone: null })).toBeNull()
  })
})

describe('evaluateLeadSubmission', () => {
  it('marca sospechoso si falta la ficha, aunque los datos sean normales', () => {
    const r = evaluateLeadSubmission({ name: 'Julián Parra', email: 'julian@gmail.com', ticket: null })
    expect(r.suspectedBot).toBe(true)
    expect(r.reason).toMatch(/ficha/)
  })

  it('marca sospechoso si los datos son de relleno, aunque la ficha sea válida', () => {
    const t = issueLeadTicket()
    const r = evaluateLeadSubmission({ name: 'John Doe', email: 'john.doe@x.com', ticket: t })
    expect(r.suspectedBot).toBe(true)
    expect(r.reason).toMatch(/John Doe/i)
  })

  it('un lead real con ficha válida NO se marca', () => {
    const t = issueLeadTicket()
    const r = evaluateLeadSubmission({
      name: 'Julián Parra',
      email: 'julian@gmail.com',
      phone: '+54 11 6123 4567',
      ticket: t,
    })
    expect(r.suspectedBot).toBe(false)
    expect(r.reason).toBeNull()
  })

  it('nunca lanza — siempre devuelve un veredicto, nunca rechaza (contrato: se guarda igual)', () => {
    expect(() => evaluateLeadSubmission({ name: '' })).not.toThrow()
  })
})
