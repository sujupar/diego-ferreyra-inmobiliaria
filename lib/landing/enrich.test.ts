import { describe, it, expect } from 'vitest'
import { ENRICH_STAGES, nextEnrichStage, enrichLabel, enrichPercent, etapaTrasAvatares } from './enrich'

describe('nextEnrichStage', () => {
  it('arranca por Vision cuando la landing recién se creó', () => {
    expect(nextEnrichStage({ enrich: 'vision' })).toBe('vision')
  })

  it('el orden v2 es vision → location → description → avatars (sin copy automático)', () => {
    expect(ENRICH_STAGES).toEqual(['vision', 'location', 'description', 'avatars'])
    expect(nextEnrichStage({ enrich: 'location' })).toBe('location')
    expect(nextEnrichStage({ enrich: 'description' })).toBe('description')
    expect(nextEnrichStage({ enrich: 'avatars' })).toBe('avatars')
    expect(nextEnrichStage({ enrich: 'done' })).toBe('done')
  })

  it('un puntero re-armado en copy (post-respuestas) es una etapa válida', () => {
    // El envío de respuestas re-arma enrich='copy' para que el loop del cliente
    // genere los textos. También cubre drafts viejos que quedaron a mitad en v1.
    expect(nextEnrichStage({ enrich: 'copy' })).toBe('copy')
  })

  it('trata como COMPLETA una landing sin el campo (creada antes de este cambio)', () => {
    // Clave para no re-generar con IA las landings viejas ni pisar su contenido.
    expect(nextEnrichStage({})).toBe('done')
    expect(nextEnrichStage({ enrich: undefined, extra: 'algo' } as never)).toBe('done')
  })

  it('un valor desconocido se trata como completa (nunca loopea infinito)', () => {
    expect(nextEnrichStage({ enrich: 'basura' as never })).toBe('done')
  })
})

describe('etapaTrasAvatares (autopilot, 2026-09-14)', () => {
  const preguntas = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }]
  const respuestas = { q1: 'a', q2: 'b', q3: 'c', q4: 'd' }

  it('sin autopilot, después de los avatares se frena (el asesor responde en la ficha)', () => {
    expect(etapaTrasAvatares({ questions: preguntas, answers: respuestas })).toBe('done')
  })

  it('con autopilot y las respuestas de la visita, encadena la etapa de textos', () => {
    expect(etapaTrasAvatares({ autopilot: true, questions: preguntas, answers: respuestas })).toBe('copy')
  })

  it('autopilot con una respuesta faltante NO encadena: no se publica copy genérico', () => {
    expect(etapaTrasAvatares({ autopilot: true, questions: preguntas, answers: { q1: 'a', q2: 'b', q3: 'c' } })).toBe('done')
    expect(etapaTrasAvatares({ autopilot: true, questions: preguntas, answers: { ...respuestas, q4: '  ' } })).toBe('done')
  })

  it('autopilot sin preguntas guardadas tampoco encadena', () => {
    expect(etapaTrasAvatares({ autopilot: true, questions: [], answers: respuestas })).toBe('done')
  })
})

describe('enrichLabel / enrichPercent', () => {
  it('da un texto humano por etapa', () => {
    expect(enrichLabel('vision')).toMatch(/foto/i)
    expect(enrichLabel('location')).toMatch(/ubicación/i)
    expect(enrichLabel('description')).toMatch(/descripci/i)
    expect(enrichLabel('avatars')).toMatch(/avatar|pregunta/i)
    expect(enrichLabel('copy')).toMatch(/text/i)
    expect(enrichLabel('done')).toMatch(/list/i)
  })

  it('el progreso avanza y termina en 100', () => {
    const pcts = [...ENRICH_STAGES, 'done' as const].map(enrichPercent)
    expect(pcts[pcts.length - 1]).toBe(100)
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThan(pcts[i - 1])
  })

  it('copy (re-armada) muestra progreso alto pero no terminado', () => {
    expect(enrichPercent('copy')).toBeGreaterThanOrEqual(80)
    expect(enrichPercent('copy')).toBeLessThan(100)
  })

  it('ninguna etapa arranca en 0 (el asesor ve movimiento desde el principio)', () => {
    expect(enrichPercent('vision')).toBeGreaterThan(0)
  })
})
