import { describe, it, expect } from 'vitest'
import { ENRICH_STAGES, nextEnrichStage, enrichLabel, enrichPercent } from './enrich'

describe('nextEnrichStage', () => {
  it('arranca por Vision cuando la landing recién se creó', () => {
    expect(nextEnrichStage({ enrich: 'vision' })).toBe('vision')
  })

  it('avanza en el orden declarado', () => {
    expect(ENRICH_STAGES).toEqual(['vision', 'description', 'avatars', 'copy'])
    expect(nextEnrichStage({ enrich: 'description' })).toBe('description')
    expect(nextEnrichStage({ enrich: 'avatars' })).toBe('avatars')
    expect(nextEnrichStage({ enrich: 'copy' })).toBe('copy')
    expect(nextEnrichStage({ enrich: 'done' })).toBe('done')
  })

  it('trata como COMPLETA una landing sin el campo (creada antes de este cambio)', () => {
    // Clave para no re-generar con IA las landings viejas ni pisar su contenido.
    expect(nextEnrichStage({})).toBe('done')
    expect(nextEnrichStage({ visionSummary: 'algo' })).toBe('done')
  })

  it('un valor desconocido se trata como completa (nunca loopea infinito)', () => {
    expect(nextEnrichStage({ enrich: 'basura' as never })).toBe('done')
  })
})

describe('enrichLabel / enrichPercent', () => {
  it('da un texto humano por etapa', () => {
    expect(enrichLabel('vision')).toMatch(/foto/i)
    expect(enrichLabel('description')).toMatch(/descripci/i)
    expect(enrichLabel('avatars')).toMatch(/avatar|comprador/i)
    expect(enrichLabel('copy')).toMatch(/text/i)
    expect(enrichLabel('done')).toMatch(/list/i)
  })

  it('el progreso avanza y termina en 100', () => {
    const pcts = [...ENRICH_STAGES, 'done' as const].map(enrichPercent)
    expect(pcts[pcts.length - 1]).toBe(100)
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThan(pcts[i - 1])
  })

  it('ninguna etapa arranca en 0 (el asesor ve movimiento desde el principio)', () => {
    expect(enrichPercent('vision')).toBeGreaterThan(0)
  })
})
