import { describe, it, expect } from 'vitest'
import {
  estimateCostUsd,
  summarizeTotals,
  groupAnalysesByDay,
  summarizeAgentVisits,
  type AiUsageStateRow,
} from './ai-usage'

function row(overrides: Partial<AiUsageStateRow>): AiUsageStateRow {
  return {
    phone_e164: '5491100000000',
    intent: 'desconocido',
    analyses_count: 0,
    tokens_used_total: 0,
    agent_messages_sent: 0,
    agent_handed_off: false,
    last_analyzed_at: null,
    ...overrides,
  }
}

describe('estimateCostUsd', () => {
  it('0 tokens = 0 costo', () => {
    expect(estimateCostUsd(0)).toBe(0)
  })

  it('escala linealmente con los tokens', () => {
    const c1 = estimateCostUsd(1_000_000, 0.5)
    const c2 = estimateCostUsd(2_000_000, 0.5)
    expect(c2).toBeCloseTo(c1 * 2, 6)
  })

  it('negativo o NaN nunca da un costo negativo/roto', () => {
    expect(estimateCostUsd(-5)).toBe(0)
    expect(estimateCostUsd(NaN)).toBe(0)
  })
})

describe('summarizeTotals', () => {
  it('sin filas, todo en cero (nunca undefined/NaN)', () => {
    const t = summarizeTotals([])
    expect(t).toEqual({
      conversationsAnalyzed: 0,
      analysesCount: 0,
      tokensUsedTotal: 0,
      estimatedCostUsd: 0,
      agentMessagesSent: 0,
      agentHandedOff: 0,
    })
  })

  it('suma tokens/análisis/mensajes de todas las conversaciones', () => {
    const rows = [
      row({ phone_e164: 'a', analyses_count: 3, tokens_used_total: 1000, agent_messages_sent: 2 }),
      row({ phone_e164: 'b', analyses_count: 1, tokens_used_total: 500, agent_messages_sent: 0 }),
    ]
    const t = summarizeTotals(rows)
    expect(t.analysesCount).toBe(4)
    expect(t.tokensUsedTotal).toBe(1500)
    expect(t.agentMessagesSent).toBe(2)
    expect(t.conversationsAnalyzed).toBe(2)
  })

  it('una conversación con analyses_count=0 no cuenta como "analizada"', () => {
    const rows = [row({ phone_e164: 'nunca-analizada', analyses_count: 0 })]
    expect(summarizeTotals(rows).conversationsAnalyzed).toBe(0)
  })

  it('cuenta agentHandedOff', () => {
    const rows = [row({ phone_e164: 'a', agent_handed_off: true }), row({ phone_e164: 'b', agent_handed_off: false })]
    expect(summarizeTotals(rows).agentHandedOff).toBe(1)
  })
})

describe('groupAnalysesByDay', () => {
  it('sin filas analizadas, no genera buckets', () => {
    expect(groupAnalysesByDay([row({ analyses_count: 0, last_analyzed_at: null })])).toEqual([])
  })

  it('agrupa por la fecha (Argentina) del último análisis', () => {
    const rows = [
      row({ phone_e164: 'a', analyses_count: 2, tokens_used_total: 1000, last_analyzed_at: '2026-08-03T14:00:00Z' }),
      row({ phone_e164: 'b', analyses_count: 1, tokens_used_total: 500, last_analyzed_at: '2026-08-03T20:00:00Z' }),
    ]
    const buckets = groupAnalysesByDay(rows)
    expect(buckets).toHaveLength(1)
    expect(buckets[0].date).toBe('2026-08-03')
    expect(buckets[0].conversationsCount).toBe(2)
    expect(buckets[0].analysesCount).toBe(3)
    expect(buckets[0].tokensUsedTotal).toBe(1500)
  })

  it('días distintos dan buckets distintos, ordenados desc (más reciente primero)', () => {
    const rows = [
      row({ phone_e164: 'a', analyses_count: 1, last_analyzed_at: '2026-08-01T10:00:00Z' }),
      row({ phone_e164: 'b', analyses_count: 1, last_analyzed_at: '2026-08-03T10:00:00Z' }),
    ]
    const buckets = groupAnalysesByDay(rows)
    expect(buckets.map(b => b.date)).toEqual(['2026-08-03', '2026-08-01'])
  })

  it('un timestamp cerca de medianoche Argentina (UTC-3) cae en el día correcto', () => {
    // 2026-08-03T02:00:00Z = 2026-08-02 23:00 en Argentina (UTC-3)
    const rows = [row({ phone_e164: 'a', analyses_count: 1, last_analyzed_at: '2026-08-03T02:00:00Z' })]
    expect(groupAnalysesByDay(rows)[0].date).toBe('2026-08-02')
  })
})

describe('summarizeAgentVisits', () => {
  it('sin visitas ni conversaciones, todo en cero', () => {
    expect(summarizeAgentVisits([], [])).toEqual({ proposed: 0, confirmed: 0 })
  })

  it('solo cuenta visitas de conversaciones donde el agente ESCRIBIÓ (agentMessagesSent > 0)', () => {
    const conversations = [
      { phoneE164: '5491122334455', agentMessagesSent: 2 },
      { phoneE164: '5491100000000', agentMessagesSent: 0 }, // la IA la analizó pero nunca escribió
    ]
    const visits = [
      { clientPhone: '5491122334455', status: 'pending_confirmation' },
      { clientPhone: '5491100000000', status: 'pending_confirmation' },
    ]
    const r = summarizeAgentVisits(conversations, visits)
    expect(r.proposed).toBe(1)
  })

  it('tolera formatos de teléfono distintos (con/sin 9, con/sin +54)', () => {
    const conversations = [{ phoneE164: '5491122334455', agentMessagesSent: 1 }]
    const visits = [{ clientPhone: '+54 11 2233-4455', status: 'scheduled' }]
    const r = summarizeAgentVisits(conversations, visits)
    expect(r.proposed).toBe(1)
    expect(r.confirmed).toBe(1)
  })

  it('cuenta confirmed solo para scheduled/completed, no pending_confirmation/cancelled', () => {
    const conversations = [{ phoneE164: '5491122334455', agentMessagesSent: 1 }]
    const visits = [
      { clientPhone: '5491122334455', status: 'pending_confirmation' },
      { clientPhone: '5491122334455', status: 'cancelled' },
    ]
    const r = summarizeAgentVisits(conversations, visits)
    expect(r.proposed).toBe(2)
    expect(r.confirmed).toBe(0)
  })

  it('un client_phone null no revienta', () => {
    const conversations = [{ phoneE164: '5491122334455', agentMessagesSent: 1 }]
    const visits = [{ clientPhone: null, status: 'scheduled' }]
    expect(() => summarizeAgentVisits(conversations, visits)).not.toThrow()
    expect(summarizeAgentVisits(conversations, visits).proposed).toBe(0)
  })
})
