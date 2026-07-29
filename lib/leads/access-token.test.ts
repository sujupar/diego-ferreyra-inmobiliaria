import { describe, it, expect } from 'vitest'
import { generateAccessToken, accessUrl } from './access-token'

describe('generateAccessToken', () => {
  it('devuelve 10 caracteres base62', () => {
    const t = generateAccessToken()
    expect(t).toHaveLength(10)
    expect(t).toMatch(/^[0-9A-Za-z]{10}$/)
  })

  it('no repite en 5000 generaciones (colisión práctica ~0)', () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateAccessToken()))
    expect(set.size).toBe(5000)
  })

  it('no usa caracteres ambiguos para dictar por teléfono', () => {
    // Se excluyen O/0/I/l/1 para que el link sea legible si alguien lo copia a mano.
    const muestras = Array.from({ length: 500 }, () => generateAccessToken()).join('')
    expect(muestras).not.toMatch(/[O0Il1]/)
  })
})

describe('accessUrl', () => {
  it('arma la URL corta sobre el dominio propio', () => {
    expect(accessUrl('abc123XYZ9')).toMatch(/\/v\/abc123XYZ9$/)
    expect(accessUrl('abc123XYZ9').startsWith('http')).toBe(true)
  })
})
