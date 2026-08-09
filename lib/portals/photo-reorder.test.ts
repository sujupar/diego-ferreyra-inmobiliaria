import { describe, it, expect } from 'vitest'
import { reordenarSinPerder } from './photo-reorder'

const A = ['a', 'b', 'c', 'd']

describe('reordenarSinPerder', () => {
  it('reordena una permutación completa', () => {
    expect(reordenarSinPerder(A, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'd', 'b'])
  })

  it('NUNCA pierde: lo que falta en lo enviado se apendea al final en su orden', () => {
    // El caso del bug: el wizard mandaba solo las primeras 12 y el resto
    // desaparecía de la propiedad para siempre.
    expect(reordenarSinPerder(A, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })

  it('NUNCA inyecta: una URL que no es de la propiedad se descarta', () => {
    expect(reordenarSinPerder(A, ['x', 'b', 'a'])).toEqual(['b', 'a', 'c', 'd'])
  })

  it('deduplica lo enviado', () => {
    expect(reordenarSinPerder(A, ['b', 'b', 'a'])).toEqual(['b', 'a', 'c', 'd'])
  })

  it('enviado vacío = queda todo como estaba', () => {
    expect(reordenarSinPerder(A, [])).toEqual(A)
  })

  it('propiedad sin fotos = resultado vacío aunque manden URLs', () => {
    expect(reordenarSinPerder([], ['x', 'y'])).toEqual([])
  })
})
