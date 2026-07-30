import { describe, it, expect } from 'vitest'
import { extraerCountryCode, resolveGeoCountry, GEO_COUNTRY_FALLBACK } from './geo'

describe('extraerCountryCode', () => {
  it('lee JSON plano {"country":{"code":"AR"}}', () => {
    expect(extraerCountryCode(JSON.stringify({ country: { code: 'AR', name: 'Argentina' } }))).toBe('AR')
  })

  it('lee JSON envuelto en "geo" (otra forma documentada por Netlify)', () => {
    expect(
      extraerCountryCode(JSON.stringify({ geo: { country: { code: 'US', name: 'United States' } } })),
    ).toBe('US')
  })

  it('lee la versión base64 de ambas formas', () => {
    const plano = Buffer.from(JSON.stringify({ country: { code: 'CO' } })).toString('base64')
    expect(extraerCountryCode(plano)).toBe('CO')
    const anidado = Buffer.from(JSON.stringify({ geo: { country: { code: 'MX' } } })).toString('base64')
    expect(extraerCountryCode(anidado)).toBe('MX')
  })

  it('normaliza a mayúsculas', () => {
    expect(extraerCountryCode(JSON.stringify({ country: { code: 'ar' } }))).toBe('AR')
  })

  it('devuelve null ante ausencia, basura o shape inesperado — nunca lanza', () => {
    expect(extraerCountryCode(null)).toBeNull()
    expect(extraerCountryCode(undefined)).toBeNull()
    expect(extraerCountryCode('')).toBeNull()
    expect(extraerCountryCode('no es json ni base64 útil')).toBeNull()
    expect(extraerCountryCode(JSON.stringify({ city: 'Buenos Aires' }))).toBeNull()
    expect(extraerCountryCode(JSON.stringify({ country: { code: 'ARG' } }))).toBeNull() // 3 letras, no ISO2
  })
})

describe('resolveGeoCountry', () => {
  it('cae a AR cuando no hay header (caso local, sin Netlify)', () => {
    expect(resolveGeoCountry(null)).toBe(GEO_COUNTRY_FALLBACK)
    expect(resolveGeoCountry(undefined)).toBe('AR')
  })

  it('devuelve el país detectado cuando el header es válido', () => {
    expect(resolveGeoCountry(JSON.stringify({ country: { code: 'BR' } }))).toBe('BR')
  })
})
