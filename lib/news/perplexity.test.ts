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
  })

  it('limpia el resumen: saca encabezado markdown, título repetido y recorta largo', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    const tituloLargo = 'Impuestos: ajuste por inflación con subas de hasta 30 por ciento'
    const snippetCrudo =
      `# ${tituloLargo} El gobierno bonaerense prevé ajustar los impuestos por inflación el año que viene. ` +
      'Por eso esquivan hablar de aumentos y prefieren referirse a una "actualización". Pero en términos ' +
      'prácticos, en relación a los valores de los tributos de este año, el ajuste rondará el 30 por ciento. ' +
      '"La Ley Impositiva 2027 reconoce el esfuerzo de los sectores productivos tanto como de los ciudadanos ' +
      'bonaerenses y no incrementa la presión tributaria", grafico el ministro de Economía, Pablo López.'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: tituloLargo, url: 'https://www.eldia.com/a', snippet: snippetCrudo, date: '2026-11-06' },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await searchRealEstateNews()
    expect(res).toHaveLength(1)
    const { resumen } = res[0]
    expect(resumen.startsWith('#')).toBe(false)
    expect(resumen.toLowerCase().startsWith(tituloLargo.toLowerCase())).toBe(false)
    expect(resumen.length).toBeLessThanOrEqual(261)
    expect(resumen.endsWith('…')).toBe(true)
    expect(res[0].medio).toBe('eldia.com')
    expect(res[0].fecha).toBe('2026-11-06')
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
      // `n` fijado en una variable propia de ESTA llamada: con las 7 queries en paralelo
      // (Promise.allSettled), las 7 invocaciones de fetch corren sincrónicamente antes de
      // que cualquier .json() se resuelva — si el closure de abajo leyera `n` en vez de
      // `miN`, las 7 promesas de json() verían el mismo valor final (7).
      const miN = n
      if (miN <= 3) return { ok: false, status: 429, json: async () => ({}) }
      return { ok: true, json: async () => ({ results: [{ title: 't', url: `https://x.com/${miN}`, snippet: 's', date: '2026-10-27' }] }) }
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

describe('scanRealEstateNews — el mock nunca se activa en silencio (anti-goal: nada inventado a Diego)', () => {
  it('NEWS_SCAN_MOCK=1 fuera de producción (NODE_ENV=test, el default de vitest) sí usa el mock', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    vi.stubEnv('NEWS_SCAN_MOCK', '1')
    const res = await scanRealEstateNews()
    expect(res.candidates.length).toBeGreaterThanOrEqual(1)
    expect(res.failedQueries).toBe(0)
  })

  it('NEWS_SCAN_MOCK=1 EN PRODUCCIÓN no activa el mock: sin key, lanza el error legible', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    vi.stubEnv('NEWS_SCAN_MOCK', '1')
    vi.stubEnv('NODE_ENV', 'production')
    await expect(scanRealEstateNews()).rejects.toThrow(/PERPLEXITY_API_KEY/)
  })

  it('sin PERPLEXITY_API_KEY y sin NEWS_SCAN_MOCK, aunque NODE_ENV no sea producción, lanza el error (nunca cae a mock por default)', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    vi.stubEnv('NEWS_SCAN_MOCK', '')
    await expect(scanRealEstateNews()).rejects.toThrow(/PERPLEXITY_API_KEY/)
  })

  it('opts.mock===true gana siempre, incluso en producción (uso explícito de tests)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await scanRealEstateNews({ mock: true })
    expect(res.candidates.length).toBeGreaterThanOrEqual(1)
  })
})
