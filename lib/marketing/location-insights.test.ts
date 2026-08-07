import { describe, it, expect } from 'vitest'
import { buildQueries, parseSearchResults, formatInsightsForPrompt, type LocationInsights } from './location-insights'

describe('buildQueries', () => {
  it('arma 4 categorías ancladas en dirección y barrio', () => {
    const qs = buildQueries('Av. Triunvirato 4200', 'Villa Urquiza', 'CABA')
    expect(qs).toHaveLength(4)
    expect(qs.map(q => q.categoria).sort()).toEqual(['comercios', 'educacion', 'transporte', 'verde'])
    for (const q of qs) expect(q.query).toContain('Villa Urquiza')
    expect(qs[0].query).toContain('Av. Triunvirato 4200')
  })
  it('sin barrio usa la ciudad; sin nada devuelve []', () => {
    expect(buildQueries(null, null, 'CABA').length).toBe(4)
    expect(buildQueries(null, null, null)).toEqual([])
  })
})

describe('parseSearchResults', () => {
  it('prioriza local_packs (lugares reales) y suma organic title+snippet', () => {
    const json = {
      local_packs: [
        { title: 'Estación Palermo Línea D', details: ['Servicio de transporte'] },
        { title: 'Scalabrini Ortiz', details: ['Estación de metro'] },
      ],
      organic_results: [
        { title: 'Mapa del subte', snippet: 'Combinaciones y estaciones' },
      ],
    }
    const out = parseSearchResults(json, 5)
    expect(out[0]).toContain('Estación Palermo Línea D')
    expect(out).toHaveLength(3)
    expect(out[2]).toContain('Mapa del subte')
  })
  it('deduplica y recorta a 160 chars', () => {
    const json = {
      organic_results: [
        { title: 'Subte B Los Incas', snippet: 'A 400 m' },
        { title: 'Subte B Los Incas', snippet: 'A 400 m' },
        { title: 'x'.repeat(300), snippet: 'y'.repeat(300) },
      ],
    }
    const out = parseSearchResults(json, 5)
    expect(out).toHaveLength(2)
    expect(out[1].length).toBeLessThanOrEqual(160)
  })
  it('basura → []', () => {
    expect(parseSearchResults(null)).toEqual([])
    expect(parseSearchResults({ organic_results: 'nope' })).toEqual([])
    expect(parseSearchResults(undefined)).toEqual([])
  })
})

describe('formatInsightsForPrompt', () => {
  it('null o sin datos → cadena vacía', () => {
    expect(formatInsightsForPrompt(null)).toBe('')
    const vacio: LocationInsights = {
      zona: 'X', fuente: 'sin_busqueda',
      categorias: { transporte: [], comercios: [], educacion: [], verde: [] },
    }
    expect(formatInsightsForPrompt(vacio)).toBe('')
  })
  it('lista solo categorías con datos y el mercado si existe', () => {
    const s = formatInsightsForPrompt({
      zona: 'Villa Urquiza, CABA', fuente: 'google',
      categorias: { transporte: ['Subte B a 400 m'], comercios: [], educacion: [], verde: [] },
      mercado: { precioM2Usd: 2400 },
    })
    expect(s).toContain('Subte B')
    expect(s).toContain('2400')
    expect(s).toContain('Villa Urquiza')
    expect(s.toLowerCase()).not.toContain('comercios')
  })
})
