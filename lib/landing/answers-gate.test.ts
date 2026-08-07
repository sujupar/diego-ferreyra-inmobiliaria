import { describe, it, expect } from 'vitest'
import { faltanRespuestas } from './answers-gate'

describe('faltanRespuestas', () => {
  const questions = [{ id: 'q1' }, { id: 'q2' }]

  it('sin preguntas (landing legacy o enrich caído) no bloquea', () => {
    expect(faltanRespuestas({})).toEqual([])
    expect(faltanRespuestas({ questions: [] })).toEqual([])
  })

  it('detecta faltantes y respuestas vacías-con-espacios', () => {
    expect(faltanRespuestas({ questions, answers: { q1: 'ok', q2: '   ' } })).toEqual(['q2'])
    expect(faltanRespuestas({ questions, answers: {} })).toEqual(['q1', 'q2'])
    expect(faltanRespuestas({ questions })).toEqual(['q1', 'q2'])
  })

  it('todas respondidas → []', () => {
    expect(faltanRespuestas({ questions, answers: { q1: 'a', q2: 'b' } })).toEqual([])
  })
})
