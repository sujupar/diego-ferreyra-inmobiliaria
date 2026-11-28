import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCorridas } from './corridas'

function dbFalsa(respuestas: Array<{ data: unknown; error: { message: string } | null }>) {
  let i = 0
  const from = () => {
    const r = respuestas[i++]
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'order', 'limit', 'in']) b[op] = () => b
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok)
    return b
  }
  return { from } as unknown as SupabaseClient
}

describe('leerCorridas', () => {
  it('devuelve la última y la última ok', async () => {
    const f = { id: 'c1', estado: 'ok' }
    const r = await leerCorridas(dbFalsa([{ data: [f], error: null }, { data: [f], error: null }]))
    expect(r).toEqual({ ultima: f, ultimaOk: f })
  })
  it('sin filas: nulls (radar que nunca corrió)', async () => {
    const r = await leerCorridas(dbFalsa([{ data: [], error: null }, { data: [], error: null }]))
    expect(r).toEqual({ ultima: null, ultimaOk: null })
  })
  it('un error de lectura TIRA, no se disfraza de "nunca corrió"', async () => {
    await expect(leerCorridas(dbFalsa([{ data: null, error: { message: 'timeout' } }, { data: [], error: null }]))).rejects.toThrow(/timeout/)
  })
})
