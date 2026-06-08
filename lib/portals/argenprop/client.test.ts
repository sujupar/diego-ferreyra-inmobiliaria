import { describe, it, expect } from 'vitest'
import { encodeForm, parseApResponse } from './client'

describe('encodeForm', () => {
  it('codifica claves con [] y . sin romper', () => {
    const body = encodeForm({ 'imagenes[0].url': 'https://a/b.jpg?x=1', 'aviso.Precio': '100' })
    expect(body).toContain('imagenes%5B0%5D.url=https%3A%2F%2Fa%2Fb.jpg%3Fx%3D1')
    expect(body).toContain('aviso.Precio=100')
  })
})

describe('parseApResponse', () => {
  it('extrae ids de visibilidad de una respuesta array', () => {
    const r = parseApResponse([{ id: 111 }, { id: 222 }])
    expect(r.visibilidadIds).toEqual(['111', '222'])
    expect(r.ok).toBe(true)
  })
  it('detecta error cuando viene un envelope con Mensaje/Error', () => {
    const r = parseApResponse({ Error: true, Mensaje: 'credenciales inválidas' })
    expect(r.ok).toBe(false)
    expect(r.errorMessage).toContain('credenciales')
  })
})
