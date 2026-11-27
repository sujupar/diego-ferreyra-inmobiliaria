import { describe, it, expect } from 'vitest'
import { ALFABETO, LARGO_CODIGO, REGEX_CODIGO, generarCodigo, esCodigoValido, urlDelEnlace } from './codigo'

describe('código del enlace personal', () => {
  it('usa el alfabeto de lead_access_tokens: sin I, O, l, 0 ni 1, y con la o minúscula', () => {
    for (const c of 'IOl01') expect(ALFABETO).not.toContain(c)
    expect(ALFABETO).toContain('o')
    expect(ALFABETO).toHaveLength(57)
  })

  it('cada letra del alfabeto pasa el CHECK de la base (misma regex)', () => {
    for (const c of ALFABETO) expect(REGEX_CODIGO.test(c.repeat(LARGO_CODIGO))).toBe(true)
  })

  it('genera códigos de 10 caracteres válidos y distintos', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const c = generarCodigo()
      expect(c).toHaveLength(10)
      expect(esCodigoValido(c)).toBe(true)
      vistos.add(c)
    }
    expect(vistos.size).toBe(2000)
  })

  it('rechaza largos y caracteres que no son del alfabeto', () => {
    expect(esCodigoValido('k7Hq2mXb9')).toBe(false)
    expect(esCodigoValido('k7Hq2mXb9TT')).toBe(false)
    expect(esCodigoValido('k7Hq2mXb9O')).toBe(false)
    expect(esCodigoValido('k7Hq2mXb9-')).toBe(false)
    expect(esCodigoValido('paula.vcf')).toBe(false)
    expect(esCodigoValido('k7Hq2mXb9T')).toBe(true)
  })

  it('arma la URL corta de la plataforma', () => {
    expect(urlDelEnlace('k7Hq2mXb9T', 'https://inmodf.com.ar/')).toBe('https://inmodf.com.ar/t/k7Hq2mXb9T')
    expect(urlDelEnlace('k7Hq2mXb9T', undefined)).toBe('https://inmodf.com.ar/t/k7Hq2mXb9T')
  })
})
