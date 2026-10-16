import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { tokenDesdeBytes, esTokenEncuesta, vencimientoDesde, estaVencida, urlDeLaEncuesta, LARGO_TOKEN } from './link'

describe('token de la encuesta', () => {
  it('16 bytes al azar dan 22 caracteres base64url, sin relleno', () => {
    for (let i = 0; i < 50; i++) {
      const t = tokenDesdeBytes(randomBytes(16))
      expect(t).toHaveLength(LARGO_TOKEN)
      expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/)
      expect(esTokenEncuesta(t)).toBe(true)
    }
  })
  it('con otra cantidad de bytes falla ruidoso (nunca un token más débil)', () => {
    expect(() => tokenDesdeBytes(new Uint8Array(8))).toThrow('16 bytes')
  })
  it.each([
    ['vacío', ''], ['corto', 'abc'], ['23 caracteres', 'Ab3xK9pQ2rTz8LmN4vWq1YZ'], ['con barra', 'Ab3xK9pQ2rTz8LmN4vW/1Y'],
    ['con espacio', 'Ab3xK9pQ2rTz8LmN4vW 1Y'], ['inyección', "x' OR '1'='1"], ['no texto', 42],
  ])('rechaza un token %s', (_n, valor) => {
    expect(esTokenEncuesta(valor)).toBe(false)
  })
})

describe('vencimiento', () => {
  const ahora = new Date('2026-10-15T15:00:00Z')
  it('vence a los 30 días', () => {
    expect(vencimientoDesde(ahora)).toBe('2026-11-14T15:00:00.000Z')
  })
  it('vencida = ya pasó o la fecha es inválida (fail-closed)', () => {
    expect(estaVencida('2026-10-15T15:00:01Z', ahora)).toBe(false)
    expect(estaVencida('2026-10-15T15:00:00Z', ahora)).toBe(true)
    expect(estaVencida('basura', ahora)).toBe(true)
  })
})

describe('urlDeLaEncuesta', () => {
  it('usa la base dada sin barra final, o inmodf.com.ar', () => {
    expect(urlDeLaEncuesta('Ab3xK9pQ2rTz8LmN4vWq1Y', 'https://preview.netlify.app/')).toBe('https://preview.netlify.app/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y')
    expect(urlDeLaEncuesta('Ab3xK9pQ2rTz8LmN4vWq1Y', '')).toBe('https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y')
    expect(urlDeLaEncuesta('Ab3xK9pQ2rTz8LmN4vWq1Y')).toBe('https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y')
  })
})
