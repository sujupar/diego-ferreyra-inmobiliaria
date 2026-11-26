import { describe, it, expect } from 'vitest'
import { esUuid } from './id-valido'

describe('esUuid', () => {
  it('un uuid → sí, en minúscula y en mayúscula', () => {
    expect(esUuid('3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e')).toBe(true)
    expect(esUuid('3F2B8C1E-4D5A-4B6C-9D7E-8F9A0B1C2D3E')).toBe(true)
  })
  it('vacío, texto suelto, un número o un uuid con algo pegado → no', () => {
    expect(esUuid('')).toBe(false)
    expect(esUuid('abc')).toBe(false)
    expect(esUuid('123')).toBe(false)
    expect(esUuid('3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e,x')).toBe(false)
    expect(esUuid(' 3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e')).toBe(false)
  })
  it('caracteres de filtro de PostgREST → no', () => {
    expect(esUuid('a),or(id.neq.0')).toBe(false)
  })
})
