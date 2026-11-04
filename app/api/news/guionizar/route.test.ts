import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const createPendingScripts = vi.fn()
vi.mock('@/lib/auth/get-user', () => ({ getUser: () => getUser() }))
vi.mock('@/lib/news/scripts-repo', () => ({ createPendingScripts: (...a: unknown[]) => createPendingScripts(...a) }))

import { POST } from './route'

const item = (o: Record<string, unknown> = {}) => ({
  titulo: 'T', medio: 'M', fecha: '2026-10-28', url: 'https://x.com/a', resumen: 'R', ...o,
})
const req = (body: unknown) =>
  new Request('http://x/api/news/guionizar', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ id: 'u1' })
})

describe('POST /api/news/guionizar', () => {
  it('401 sin sesión', async () => {
    getUser.mockResolvedValue(null)
    expect((await POST(req({ items: [item()] }))).status).toBe(401)
    expect(createPendingScripts).not.toHaveBeenCalled()
  })

  const bad: [string, unknown][] = [
    ['items no-array', { items: 'x' }],
    ['items vacío', { items: [] }],
    ['item sin url', { items: [item({ url: '' })] }],
    ['url javascript:', { items: [item({ url: 'javascript:alert(1)' })] }],
    ['fecha inválida', { items: [item({ fecha: 'hace 2 días' })] }],
    ['fecha vacía', { items: [item({ fecha: '' })] }],
    ['más de 50 items', { items: Array.from({ length: 51 }, () => item()) }],
  ]
  it.each(bad)('400: %s', async (_n, body) => {
    expect((await POST(req(body))).status).toBe(400)
    expect(createPendingScripts).not.toHaveBeenCalled()
  })

  it('200 con ids', async () => {
    createPendingScripts.mockResolvedValue({ ids: ['a', 'b'] })
    const res = await POST(req({ items: [item(), item()] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ids: ['a', 'b'] })
    expect(createPendingScripts).toHaveBeenCalledWith(expect.any(Array), 'u1')
  })

  it('500 genérico sin filtrar detalle', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createPendingScripts.mockRejectedValue(new Error('pg secret detail'))
    const res = await POST(req({ items: [item()] }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('pg secret')
  })
})
