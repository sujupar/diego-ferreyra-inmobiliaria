import { describe, it, expect } from 'vitest'
import { prefijoDeFusion, resolverFichaVigente, type FichaR } from './fichas-fusionadas'

const VIVA: FichaR = { id: '1e116561-a104-4541-9862-b6868f36b8d1', address: 'Entre Ríos 2333, Martínez, San Isidro', status: 'approved' }
const COPIA: FichaR = { id: '99f0a471-b72a-46a0-9cd4-9624c1a20ae1', address: '[FUSIONADA->1e116561] Entre Ríos 2333', status: 'descartada' }

describe('prefijoDeFusion', () => {
  it('lee el prefijo de 8 caracteres de la marca de fusión', () => {
    expect(prefijoDeFusion('[FUSIONADA->1e116561] Entre Ríos 2333')).toBe('1e116561')
  })
  it('devuelve null si la dirección no tiene la marca', () => {
    expect(prefijoDeFusion('Entre Ríos 2333, Martínez')).toBeNull()
    expect(prefijoDeFusion('')).toBeNull()
    expect(prefijoDeFusion(null)).toBeNull()
  })
  it('no acepta un prefijo que no sea hexadecimal de 8', () => {
    expect(prefijoDeFusion('[FUSIONADA->zzzz] Entre Ríos')).toBeNull()
    expect(prefijoDeFusion('[FUSIONADA->1e1165] Entre Ríos')).toBeNull()
  })
  it('acepta la marca aunque venga en mayúsculas', () => {
    expect(prefijoDeFusion('[FUSIONADA->1E116561] X')).toBe('1e116561')
  })
})

describe('resolverFichaVigente', () => {
  it('encuentra la ficha vigente cuyo id empieza con el prefijo', () => {
    const r = resolverFichaVigente(COPIA, [VIVA, COPIA])
    expect(r).toEqual({ ok: true, vigente: VIVA })
  })
  it('falla si la ficha no es una copia fusionada', () => {
    expect(resolverFichaVigente(VIVA, [VIVA, COPIA])).toEqual({ ok: false, motivo: 'no es una copia fusionada' })
  })
  it('falla si ninguna ficha vigente coincide con el prefijo', () => {
    expect(resolverFichaVigente(COPIA, [COPIA])).toEqual({ ok: false, motivo: 'no hay ficha vigente con el prefijo 1e116561' })
  })
  it('no apunta a otra ficha descartada aunque coincida el prefijo', () => {
    const descartada = { ...VIVA, status: 'descartada' }
    expect(resolverFichaVigente(COPIA, [descartada, COPIA]).ok).toBe(false)
  })
  it('falla ante dos fichas vigentes con el mismo prefijo (no adivina)', () => {
    const otra = { ...VIVA, id: '1e116561-ffff-4541-9862-b6868f36b8d1' }
    expect(resolverFichaVigente(COPIA, [VIVA, otra, COPIA])).toEqual({ ok: false, motivo: 'hay 2 fichas vigentes con el prefijo 1e116561' })
  })
  it('nunca resuelve a sí misma', () => {
    const rara = { ...COPIA, address: '[FUSIONADA->99f0a471] Entre Ríos 2333' }
    expect(resolverFichaVigente(rara, [rara]).ok).toBe(false)
  })
})
