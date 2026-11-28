import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/auth/get-user', () => ({ getUser: () => getUser() }))

const calls: { table: string; eq: [string, unknown][] }[] = []
const signed = vi.fn()
let corridas: unknown[] = []
let errorCorridas: { message: string } | null = null

function builder(table: string) {
  const rec = { table, eq: [] as [string, unknown][] }
  calls.push(rec)
  const b: Record<string, unknown> = {}
  const data = () => (table === 'video_refs'
    ? [{ id: 'r1', video_storage_path: 'a/v.mp4', portada_storage_path: null, thumbnail_url: 'http://t/x.jpg' }]
    : corridas)
  b.select = () => b
  b.eq = (c: string, v: unknown) => { rec.eq.push([c, v]); return b }
  b.in = () => b
  b.order = () => b
  b.limit = () => b
  b.then = (res: (v: unknown) => unknown) =>
    Promise.resolve(table === 'radar_corridas' && errorCorridas ? { data: null, error: errorCorridas } : { data: data(), error: null }).then(res)
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    storage: { from: () => ({ createSignedUrls: (...a: unknown[]) => signed(...a) }) },
  }),
}))

import { GET } from './route'
const req = (qs = '') => new Request(`http://x/api/video-refs${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  corridas = []
  errorCorridas = null
  getUser.mockResolvedValue({ id: 'u1' })
  signed.mockResolvedValue({ data: [{ path: 'a/v.mp4', signedUrl: 'https://s/v.mp4', error: null }], error: null })
})

describe('GET /api/video-refs', () => {
  it('401 sin sesión', async () => {
    getUser.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })
  it('sin archivo filtra fuente=radar y oculta=false, y firma el video', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const refsCall = calls.find((c) => c.table === 'video_refs')!
    expect(refsCall.eq).toContainEqual(['fuente', 'radar'])
    expect(refsCall.eq).toContainEqual(['oculta', false])
    const d = await res.json()
    expect(d.refs[0].video_url).toBe('https://s/v.mp4')
    expect(d.refs[0].portada_url).toBe('http://t/x.jpg') // sin portada propia -> thumbnail_url
    expect(d.radar.alerta).toBe('sin_corridas')
  })
  it('archivo=1 lee fuente=openclaw y no consulta el radar', async () => {
    const res = await GET(req('?archivo=1'))
    const refsCall = calls.find((c) => c.table === 'video_refs')!
    expect(refsCall.eq).toContainEqual(['fuente', 'openclaw'])
    expect(refsCall.eq).not.toContainEqual(['oculta', false])
    expect((await res.json()).radar).toBeNull()
  })
  it('si falla la lectura de corridas: radar=null (sin "sin_corridas" falso) y la lista sale igual', async () => {
    errorCorridas = { message: 'timeout' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req())
    expect(res.status).toBe(200)
    const d = await res.json()
    expect(d.radar).toBeNull()
    expect(d.refs).toHaveLength(1)
  })
})
