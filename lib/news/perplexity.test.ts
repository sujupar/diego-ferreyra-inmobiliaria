import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchRealEstateNews } from './perplexity'

afterEach(() => {
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
          { title: 'Ok', url: 'https://www.clarin.com/a', snippet: 'resumen', date: '2026-10-27' },
          { title: 'Sin url', snippet: 'x', date: '2026-10-27' },
          { title: 'Sin fecha', url: 'https://www.lanacion.com.ar/b', snippet: 'x' },
          { title: 'Dup', url: 'https://www.clarin.com/a', snippet: 'x', date: '2026-10-27' },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await searchRealEstateNews()
    expect(res).toHaveLength(1)
    expect(res[0].url).toBe('https://www.clarin.com/a')
    expect(res[0].medio).toBe('clarin.com')
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it('sin key y sin mock lanza error legible', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    await expect(searchRealEstateNews()).rejects.toThrow(/PERPLEXITY_API_KEY/)
  })
})
