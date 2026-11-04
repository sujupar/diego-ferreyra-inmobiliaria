import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const claimForGuionizado = vi.fn()
vi.mock('@/lib/auth/get-user', () => ({ getUser: () => getUser() }))
vi.mock('@/lib/video-refs/repo', () => ({ claimForGuionizado: (...a: unknown[]) => claimForGuionizado(...a) }))

import { POST } from './route'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const req = (body: unknown) =>
  new Request('http://x/api/video-refs/guionizar', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ id: 'u1' })
})

describe('POST /api/video-refs/guionizar', () => {
  it('401 sin sesión', async () => {
    getUser.mockResolvedValue(null)
    expect((await POST(req({ id: ID }))).status).toBe(401)
    expect(claimForGuionizado).not.toHaveBeenCalled()
  })
  it.each([['no-uuid', { id: 'abc' }], ['sin id', {}], ['id numérico', { id: 5 }], ['json roto', '{x']])('400: %s', async (_n, body) => {
    expect((await POST(req(body))).status).toBe(400)
    expect(claimForGuionizado).not.toHaveBeenCalled()
  })
  it('200 si sin_usar queda guionizando', async () => {
    claimForGuionizado.mockResolvedValue(true)
    const res = await POST(req({ id: ID }))
    expect(res.status).toBe(200)
    expect(claimForGuionizado).toHaveBeenCalledWith(ID, 'u1')
  })
  it('409 si ya usada', async () => {
    claimForGuionizado.mockResolvedValue(false)
    const res = await POST(req({ id: ID }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'ya fue usada' })
  })
  it('500 genérico sin filtrar detalle', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    claimForGuionizado.mockRejectedValue(new Error('pg secret detail'))
    const res = await POST(req({ id: ID }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('pg secret')
  })
})
