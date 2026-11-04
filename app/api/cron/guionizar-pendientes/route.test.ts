import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPending = vi.fn()
const markListo = vi.fn()
const markError = vi.fn()
const expireStale = vi.fn()
const guionizar = vi.fn()

vi.mock('@/lib/news/scripts-repo', () => ({
  getPendingScripts: (...a: unknown[]) => getPending(...a),
  markListo: (...a: unknown[]) => markListo(...a),
  markError: (...a: unknown[]) => markError(...a),
  expireStaleScripts: (...a: unknown[]) => expireStale(...a),
}))
vi.mock('@/lib/news/guionizar', async (orig) => ({
  ...(await orig<typeof import('@/lib/news/guionizar')>()),
  guionizarPieza: (...a: unknown[]) => guionizar(...a),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 'db-secret-ficticio' } }) }) }) }),
  }),
}))

import { POST } from './route'

const req = (secret?: string) =>
  new Request('http://x/api/cron/guionizar-pendientes', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  }) as unknown as import('next/server').NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'env-secret-ficticio'
  expireStale.mockResolvedValue(undefined)
  markListo.mockResolvedValue(undefined)
  markError.mockResolvedValue(undefined)
})

describe('POST /api/cron/guionizar-pendientes', () => {
  it('sin secreto o con secreto incorrecto -> 403 y no procesa', async () => {
    expect((await POST(req())).status).toBe(403)
    expect((await POST(req('mal'))).status).toBe(403)
    expect(getPending).not.toHaveBeenCalled()
  })

  it('acepta el secreto de cron_config', async () => {
    getPending.mockResolvedValue([])
    expect((await POST(req('db-secret-ficticio'))).status).toBe(200)
  })

  it('una pieza fallida llama markError y no frena las demás', async () => {
    getPending.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    guionizar.mockResolvedValueOnce('g-a').mockRejectedValueOnce(new Error('ENOENT /Users/x/y/z')).mockResolvedValueOnce('g-c')
    const res = await POST(req('env-secret-ficticio'))
    expect(await res.json()).toMatchObject({ procesadas: 3, ok: 2, error: 1 })
    expect(markListo).toHaveBeenCalledWith('a', 'g-a')
    expect(markListo).toHaveBeenCalledWith('c', 'g-c')
    expect(markError).toHaveBeenCalledTimes(1)
    expect(markError.mock.calls[0][0]).toBe('b')
    expect(markError.mock.calls[0][1]).not.toContain('/Users')
  })

  it('corta el loop al agotar el presupuesto de reloj', async () => {
    getPending.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValueOnce(0).mockReturnValue(30_000)
    guionizar.mockResolvedValue('g')
    const body = await (await POST(req('env-secret-ficticio'))).json()
    now.mockRestore()
    expect(body.procesadas).toBe(0)
    expect(guionizar).not.toHaveBeenCalled()
  })
})
