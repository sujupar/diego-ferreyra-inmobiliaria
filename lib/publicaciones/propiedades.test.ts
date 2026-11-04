import { describe, expect, it } from 'vitest'
import { patronDeBusqueda } from './propiedades'

describe('patronDeBusqueda', () => {
  it('busca la dirección en cualquier parte', () => {
    expect(patronDeBusqueda('doblas')).toBe('%doblas%')
  })

  it('los comodines que escribe la persona se buscan literales', () => {
    expect(patronDeBusqueda('50%_x')).toBe('%50\\%\\_x%')
    expect(patronDeBusqueda('a\\b')).toBe('%a\\\\b%')
  })

  it('las tildes de macOS se unifican y se recorta lo largo', () => {
    expect(patronDeBusqueda('Güemes')).toBe('%Güemes%')
    expect(patronDeBusqueda('x'.repeat(200))).toHaveLength(82)
  })

  it('vacío o muy corto no busca', () => {
    expect(patronDeBusqueda('')).toBeNull()
    expect(patronDeBusqueda(' a ')).toBeNull()
  })
})
