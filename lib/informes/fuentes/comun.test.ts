import { describe, expect, it } from 'vitest'
import { ok, sinLanzar } from './comun'
import type { FuenteGuardada } from '../tipos'

const ahora = new Date('2026-10-22T12:00:00Z')

describe('sinLanzar', () => {
  it('devuelve lo que trajo la fuente', async () => {
    expect(await sinLanzar(ahora, async () => ok(ahora, { n: 1 }))).toMatchObject({ estado: 'ok', datos: { n: 1 } })
  })

  it('una excepción queda como error con su motivo', async () => {
    expect(await sinLanzar(ahora, async () => { throw new Error('Meta no respondió') }))
      .toMatchObject({ estado: 'error', datos: null, error: 'Meta no respondió' })
  })

  it('una fuente colgada se corta y queda como error (nunca "pendiente" para siempre)', async () => {
    const r = await sinLanzar(ahora, () => new Promise<FuenteGuardada<unknown>>(() => {}), { topeMs: 20 })
    expect(r).toMatchObject({ estado: 'error', datos: null })
    expect(r.error).toMatch(/tardó demasiado/)
  })
})
