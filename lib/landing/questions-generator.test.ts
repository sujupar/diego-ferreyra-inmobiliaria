import { describe, it, expect } from 'vitest'
import { fallbackQuestions, QUESTIONS_SYSTEM } from './questions-generator'

describe('preguntas de co-creación', () => {
  it('el prompt prohíbe explícitamente preguntar por financiación', () => {
    expect(QUESTIONS_SYSTEM.toLowerCase()).toContain('financiación')
    expect(QUESTIONS_SYSTEM).toMatch(/NUNCA preguntes/i)
  })

  it('el fallback no menciona financiación ni crédito', () => {
    const all = JSON.stringify(fallbackQuestions({ neighborhood: 'Palermo' } as never)).toLowerCase()
    expect(all).not.toContain('financia')
    expect(all).not.toContain('crédito')
  })

  it('el fallback tiene 4 preguntas con id único', () => {
    const qs = fallbackQuestions({ neighborhood: 'Palermo' } as never)
    expect(qs).toHaveLength(4)
    expect(new Set(qs.map(q => q.id)).size).toBe(4)
  })
})
