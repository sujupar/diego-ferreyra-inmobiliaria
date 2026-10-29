import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchRealEstateNews, scanRealEstateNews } from './perplexity'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('searchRealEstateNews', () => {
  it('mock:true devuelve candidatos completos con url http', async () => {
    const res = await searchRealEstateNews({ mock: true })
    expect(res.length).toBeGreaterThanOrEqual(1)
    for (const c of res) {
      expect(c.titulo).toBeTruthy()
      expect(c.medio).toBeTruthy()
      expect(c.fecha).toBeTruthy()
      expect(c.resumen).toBeTruthy()
      expect(c.url.startsWith('http')).toBe(true)
    }
  })

  it('filtra candidatos sin url o sin fecha y deduplica por url', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Ok', url: 'https://www.clarin.com/a', snippet: 'resumen', date: '2026-10-27T15:30:00Z' },
          { title: 'Sin url', snippet: 'x', date: '2026-10-27' },
          { title: 'Sin fecha', url: 'https://www.lanacion.com.ar/b', snippet: 'x' },
          { title: 'Fecha basura', url: 'https://www.lanacion.com.ar/c', snippet: 'x', date: 'ayer' },
          { title: 'Dup', url: 'https://www.clarin.com/a', snippet: 'x', date: '2026-10-27' },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await searchRealEstateNews()
    expect(res).toHaveLength(1)
    expect(res[0].url).toBe('https://www.clarin.com/a')
    expect(res[0].medio).toBe('clarin.com')
    expect(res[0].fecha).toBe('2026-10-27')
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it('sin key y sin mock lanza error legible', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    await expect(searchRealEstateNews()).rejects.toThrow(/PERPLEXITY_API_KEY/)
  })

  it('Perplexity caído (ok:false en las 7) lanza error legible', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }))
    await expect(searchRealEstateNews()).rejects.toThrow(/No se pudo consultar Perplexity/)
  })

  it('fetch que rechaza/timeout en las 7 también lanza error legible', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(searchRealEstateNews()).rejects.toThrow(/No se pudo consultar Perplexity/)
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it('falla parcial: devuelve candidatos y cuenta queries fallidas', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let n = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      n++
      if (n <= 3) return { ok: false, status: 429, json: async () => ({}) }
      return { ok: true, json: async () => ({ results: [{ title: 't', url: `https://x.com/${n}`, snippet: 's', date: '2026-10-27' }] }) }
    }))
    const res = await scanRealEstateNews()
    expect(res.failedQueries).toBe(3)
    expect(res.candidates).toHaveLength(4)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('pasa AbortSignal a fetch', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    await searchRealEstateNews()
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})
