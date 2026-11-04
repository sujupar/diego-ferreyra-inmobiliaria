import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}))

import {
  claimForGuionizado, listVideoRefs, getVideoRef, getPendingRefs,
  markUsada, markRefError, expireStaleRefs,
} from './repo'

// Fake con estado: una fila en memoria; update().eq(id).eq(estado_uso).select('id')
function fakeTable(initial: string) {
  const row = { id: 'r1', estado_uso: initial, updated_at: 'old' }
  fromMock.mockImplementation(() => ({
    update: (patch: Record<string, unknown>) => {
      const filters: Record<string, unknown> = {}
      const chain = {
        eq: (k: string, v: unknown) => { filters[k] = v; return chain },
        select: async () => {
          const match = Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v)
          if (!match) return { data: [], error: null }
          Object.assign(row, patch)
          return { data: [{ id: row.id }], error: null }
        },
      }
      return chain
    },
  }))
  return row
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('claimForGuionizado', () => {
  it('true y transiciona sin_usar -> guionizando; la segunda llamada da false', async () => {
    const row = fakeTable('sin_usar')
    expect(await claimForGuionizado('r1', 'u1')).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('video_refs')
    expect(row.estado_uso).toBe('guionizando')
    expect(row.updated_at).not.toBe('old')
    expect(await claimForGuionizado('r1', 'u1')).toBe(false)
  })
  it.each(['guionizando', 'usada', 'error'])('false y no toca la fila si estaba en %s', async (st) => {
    const row = fakeTable(st)
    expect(await claimForGuionizado('r1', 'u1')).toBe(false)
    expect(row.estado_uso).toBe(st)
    expect(row.updated_at).toBe('old')
  })
  it('lanza si supabase devuelve error', async () => {
    fromMock.mockReturnValue({ update: () => { const c: any = { eq: () => c, select: async () => ({ data: null, error: { message: 'boom' } }) }; return c } })
    await expect(claimForGuionizado('r1', 'u1')).rejects.toThrow('boom')
  })
})

describe('lecturas', () => {
  it('listVideoRefs ordena por created_at desc', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'x' }], error: null })
    fromMock.mockReturnValue({ select: () => ({ order }) })
    expect(await listVideoRefs()).toEqual([{ id: 'x' }])
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
  })
  it('getVideoRef devuelve null si no existe', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) })
    expect(await getVideoRef('nope')).toBeNull()
  })
  it('getPendingRefs filtra estado_uso guionizando', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn().mockReturnValue({ order })
    fromMock.mockReturnValue({ select: () => ({ eq }) })
    await getPendingRefs()
    expect(eq).toHaveBeenCalledWith('estado_uso', 'guionizando')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})

describe('markUsada / markRefError / expireStaleRefs', () => {
  const setup = () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    fromMock.mockReturnValue({ update })
    return { eq1, eq2, update }
  }
  it('markUsada', async () => {
    const { eq1, eq2, update } = setup()
    await markUsada('id1', 'guion')
    expect(update.mock.calls[0][0]).toMatchObject({ guion: 'guion', estado_uso: 'usada' })
    expect(eq1).toHaveBeenCalledWith('id', 'id1')
    expect(eq2).toHaveBeenCalledWith('estado_uso', 'guionizando')
  })
  it('markRefError', async () => {
    const { eq2, update } = setup()
    await markRefError('id2', 'fallo')
    expect(update.mock.calls[0][0]).toMatchObject({ estado_uso: 'error', guion_error: 'fallo' })
    expect(eq2).toHaveBeenCalledWith('estado_uso', 'guionizando')
  })
  it('expireStaleRefs', async () => {
    const lt = vi.fn().mockResolvedValue({ error: null })
    const eq = vi.fn().mockReturnValue({ lt })
    const update = vi.fn().mockReturnValue({ eq })
    fromMock.mockReturnValue({ update })
    await expireStaleRefs(6, 'viejo')
    expect(update.mock.calls[0][0]).toMatchObject({ estado_uso: 'error', guion_error: 'viejo' })
    expect(eq).toHaveBeenCalledWith('estado_uso', 'guionizando')
    expect(lt.mock.calls[0][0]).toBe('updated_at')
  })
})

describe('expireStaleRefs: reloj desde el claim (updated_at), no desde created_at', () => {
  it('ref del backfill (created_at viejo) recién claimeada NO expira; una colgada (updated_at viejo) SÍ', async () => {
    const now = Date.now()
    const dias = (d: number) => new Date(now - d * 86400_000).toISOString()
    const rows = [
      { id: 'nueva', estado_uso: 'guionizando', created_at: dias(20), updated_at: new Date(now - 60_000).toISOString() },
      { id: 'colgada', estado_uso: 'guionizando', created_at: dias(20), updated_at: dias(1) },
    ] as Array<Record<string, unknown>>
    fromMock.mockImplementation(() => ({
      update: (patch: Record<string, unknown>) => {
        const eqs: Array<[string, unknown]> = []
        const lts: Array<[string, string]> = []
        const chain = {
          eq: (k: string, v: unknown) => { eqs.push([k, v]); return chain },
          lt: async (k: string, v: string) => {
            lts.push([k, v])
            for (const r of rows) {
              if (eqs.every(([ek, ev]) => r[ek] === ev) && lts.every(([lk, lv]) => (r[lk] as string) < lv)) Object.assign(r, patch)
            }
            return { error: null }
          },
        }
        return chain
      },
    }))
    await expireStaleRefs(6, 'viejo')
    expect(rows.find((r) => r.id === 'nueva')!.estado_uso).toBe('guionizando')
    expect(rows.find((r) => r.id === 'colgada')!.estado_uso).toBe('error')
  })
})
