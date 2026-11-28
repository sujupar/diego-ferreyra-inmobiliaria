import { describe, it, expect } from 'vitest'
import { estabilizarUrls, VIDA_URL_MS, type CacheUrls } from './urls-estables'

const ref = (video_url: string | null, portada_url: string | null) => ({
  id: 'r1', video_storage_path: 'a/v.mp4', portada_storage_path: 'a/p.jpg', video_url, portada_url,
})

describe('estabilizarUrls', () => {
  it('un refresco con firmas nuevas conserva las URLs que ya tenía (el video no se reinicia)', () => {
    const cache: CacheUrls = new Map()
    const [a] = estabilizarUrls([ref('https://s/v?t=1', 'https://s/p?t=1')], cache, 0)
    const [b] = estabilizarUrls([ref('https://s/v?t=2', 'https://s/p?t=2')], cache, 8_000)
    expect(b.video_url).toBe(a.video_url)
    expect(b.portada_url).toBe('https://s/p?t=1')
  })
  it('pasados los 50 min toma la firma nueva', () => {
    const cache: CacheUrls = new Map()
    estabilizarUrls([ref('https://s/v?t=1', 'https://s/p?t=1')], cache, 0)
    const [b] = estabilizarUrls([ref('https://s/v?t=2', 'https://s/p?t=2')], cache, VIDA_URL_MS + 1)
    expect(b.video_url).toBe('https://s/v?t=2')
    expect(b.portada_url).toBe('https://s/p?t=2')
  })
  it('sin URL firmada (falló la firma) no inventa una vieja ni la guarda', () => {
    const cache: CacheUrls = new Map()
    const [b] = estabilizarUrls([ref(null, null)], cache, 0)
    expect(b.video_url).toBeNull()
    expect(cache.size).toBe(0)
  })
  it('sin portada propia, el thumbnail pasa tal cual', () => {
    const cache: CacheUrls = new Map()
    const [b] = estabilizarUrls([{ ...ref('https://s/v', 'http://t/x.jpg'), portada_storage_path: null }], cache, 0)
    expect(b.portada_url).toBe('http://t/x.jpg')
  })
})
