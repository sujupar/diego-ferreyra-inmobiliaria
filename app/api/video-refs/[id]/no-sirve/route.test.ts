import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/auth/get-user', () => ({ getUser: () => getUser() }))

let ref: { id: string; cuenta: string | null } | null
let cuenta: { descartes_manuales: number } | null
const updates: { table: string; patch: Record<string, unknown> }[] = []

function builder(table: string) {
  let patch: Record<string, unknown> | null = null
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = () => b
  b.update = (p: Record<string, unknown>) => { patch = p; updates.push({ table, patch: p }); return b }
  b.maybeSingle = () => Promise.resolve({ data: table === 'video_refs' ? ref : cuenta, error: null })
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: patch ? [{}] : null, error: null }).then(res)
  return b
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => builder(t) }) }))

import { POST } from './route'
const ID = '123e4567-e89b-42d3-a456-426614174000'
const call = (body: unknown = {}) =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: ID }) })

beforeEach(() => {
  vi.clearAllMocks(); updates.length = 0
  getUser.mockResolvedValue({ id: 'u1' })
  ref = { id: ID, cuenta: '@casa' }
  cuenta = { descartes_manuales: 0 }
})

describe('POST no-sirve', () => {
  it('401 sin sesión', async () => {
    getUser.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })
  it('404 si no existe', async () => {
    ref = null
    expect((await call()).status).toBe(404)
  })
  it('400 si el motivo pasa de 300', async () => {
    expect((await call({ motivo: 'x'.repeat(301) })).status).toBe(400)
  })
  it('oculta y suma un descarte a la cuenta (sin @)', async () => {
    cuenta = { descartes_manuales: 1 }
    expect((await call({ motivo: 'es de otro país' })).status).toBe(200)
    const v = updates.find((u) => u.table === 'video_refs')!.patch
    expect(v.oculta).toBe(true)
    expect(v.no_sirve_motivo).toBe('es de otro país')
    expect(typeof v.no_sirve_at).toBe('string')
    expect(updates.find((u) => u.table === 'radar_cuentas')!.patch).toEqual({ descartes_manuales: 2 })
  })
  it('al tercer descarte desactiva la cuenta', async () => {
    cuenta = { descartes_manuales: 2 }
    await call()
    expect(updates.find((u) => u.table === 'radar_cuentas')!.patch).toEqual({ descartes_manuales: 3, activa: false })
  })
})
