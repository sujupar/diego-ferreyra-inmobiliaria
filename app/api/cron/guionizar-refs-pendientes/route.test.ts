import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPending = vi.fn()
const markUsada = vi.fn()
const markRefError = vi.fn()
const expireStale = vi.fn()
const guionizar = vi.fn()

vi.mock('@/lib/video-refs/repo', () => ({
  getPendingRefs: (...a: unknown[]) => getPending(...a),
  markUsada: (...a: unknown[]) => markUsada(...a),
  markRefError: (...a: unknown[]) => markRefError(...a),
  expireStaleRefs: (...a: unknown[]) => expireStale(...a),
}))
vi.mock('@/lib/video-refs/guionizar', () => ({
  guionizarReferencia: (...a: unknown[]) => guionizar(...a),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 'db-secret-ficticio' } }) }) }) }),
  }),
}))

import { POST, GET } from './route'

const req = (secret?: string) =>
  new Request('http://x/api/cron/guionizar-refs-pendientes', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  }) as unknown as import('next/server').NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'env-secret-ficticio'
  expireStale.mockResolvedValue(undefined)
  markUsada.mockResolvedValue(undefined)
  markRefError.mockResolvedValue(undefined)
})

describe('POST /api/cron/guionizar-refs-pendientes', () => {
  it('sin secreto o con secreto incorrecto -> 403 y no procesa', async () => {
    expect((await POST(req())).status).toBe(403)
    expect((await POST(req('mal'))).status).toBe(403)
    expect(getPending).not.toHaveBeenCalled()
  })

  it('acepta el secreto de cron_config', async () => {
    getPending.mockResolvedValue([])
    expect((await POST(req('db-secret-ficticio'))).status).toBe(200)
  })

  it('una ref guionizando queda usada con su guion', async () => {
    getPending.mockResolvedValue([{ id: 'a' }])
    guionizar.mockResolvedValueOnce('g-a')
    const body = await (await POST(req('env-secret-ficticio'))).json()
    expect(body).toMatchObject({ procesadas: 1, ok: 1, error: 0 })
    expect(markUsada).toHaveBeenCalledWith('a', 'g-a')
    expect(markRefError).not.toHaveBeenCalled()
  })

  it('si Gemini lanza, queda en error con guion_error sanitizado', async () => {
    getPending.mockResolvedValue([{ id: 'b' }])
    guionizar.mockRejectedValueOnce(new Error('ENOENT /Users/x/y/z'))
    const body = await (await POST(req('env-secret-ficticio'))).json()
    expect(body).toMatchObject({ procesadas: 1, ok: 0, error: 1 })
    expect(markUsada).not.toHaveBeenCalled()
    expect(markRefError.mock.calls[0][0]).toBe('b')
    expect(markRefError.mock.calls[0][1]).not.toContain('/Users')
  })

  it('presupuesto agotado tras la 1ra: la 2da queda guionizando (no se pierde ni duplica)', async () => {
    getPending.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    const now = vi.spyOn(Date, 'now')
    // inicio=0, chequeo 1ra=0 (ok), chequeo 2da=30_000 (agotado)
    now.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(30_000)
    guionizar.mockResolvedValue('g')
    const body = await (await POST(req('env-secret-ficticio'))).json()
    now.mockRestore()
    expect(body).toMatchObject({ procesadas: 1, ok: 1, pendientes: 1 })
    expect(guionizar).toHaveBeenCalledTimes(1)
    expect(markUsada).toHaveBeenCalledTimes(1)
    expect(markUsada).toHaveBeenCalledWith('a', 'g')
    expect(markRefError).not.toHaveBeenCalled()
  })

  it('GET ?ping=1 responde la ruta; sin ping 403', async () => {
    const ok = await GET(new Request('http://x/a?ping=1') as unknown as import('next/server').NextRequest)
    expect(await ok.json()).toEqual({ ok: true, route: 'guionizar-refs-pendientes' })
    expect((await GET(new Request('http://x/a') as unknown as import('next/server').NextRequest)).status).toBe(403)
  })
})
