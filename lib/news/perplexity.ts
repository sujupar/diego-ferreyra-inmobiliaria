// Cliente Perplexity Search para el escaneo de noticias inmobiliarias de Argentina.
// Portado de la edge function perplexity-search (aston-martin-residences):
// recencyFilter, dedup por URL, domainFilter, Authorization: Bearer.

export type NewsCandidate = {
  titulo: string
  medio: string
  fecha: string
  url: string
  resumen: string
}

const ENDPOINT = 'https://api.perplexity.ai/search'

// Los 7 temas del escaneo (spec Noticias autoservicio).
export const NEWS_QUERIES: string[] = [
  'impuestos inmobiliarios Argentina novedades (ABL, ganancias, transferencia, inmobiliario)',
  'cambios de ley mercado inmobiliario Argentina alquileres propiedad',
  'regulaciones inmobiliarias Argentina nuevas normas corredores inmobiliarios',
  'datos de mercado inmobiliario Capital Federal y Zona Norte precios m2 operaciones escrituras',
  'cambios de tendencias mercado inmobiliario Argentina demanda oferta',
  'primicias inmobiliarias Argentina lanzamientos desarrollos emprendimientos',
  'bancos créditos hipotecarios Argentina noticias tasas sector inmobiliario',
]

const DOMAIN_FILTER = [
  '-pinterest.com',
  '-reddit.com',
  '-quora.com',
  '-facebook.com',
  '-twitter.com',
  '-x.com',
]

const MAX_RESULTS_PER_QUERY = 5
const REQUEST_TIMEOUT_MS = 8000

type PerplexityResult = {
  title?: string
  url?: string
  snippet?: string
  date?: string | null
  last_updated?: string | null
}

function medioFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function toCandidate(r: PerplexityResult): NewsCandidate | null {
  const url = (r.url || '').trim()
  const rawFecha = (r.date || r.last_updated || '').trim()
  // Regla de calidad: nunca devolver una pieza sin url o con fecha ausente/inválida.
  if (!url.startsWith('http') || !rawFecha) return null
  const ts = Date.parse(rawFecha)
  if (Number.isNaN(ts)) return null
  const fecha = new Date(ts).toISOString().slice(0, 10)
  const medio = medioFromUrl(url)
  if (!medio) return null
  return {
    titulo: (r.title || '').trim() || 'Sin título',
    medio,
    fecha,
    url,
    resumen: (r.snippet || '').trim(),
  }
}

function mockCandidates(): NewsCandidate[] {
  return [
    {
      titulo: 'Escrituras en la Ciudad de Buenos Aires: el Colegio de Escribanos reportó una suba interanual',
      medio: 'lanacion.com.ar',
      fecha: '2026-10-27',
      url: 'https://www.lanacion.com.ar/propiedades/ejemplo-escrituras-caba',
      resumen: 'Ejemplo: las operaciones de compraventa en CABA mostraron un aumento interanual impulsado por el crédito hipotecario.',
    },
    {
      titulo: 'Zona Norte: los valores del m2 en barrios cerrados se mantienen firmes',
      medio: 'clarin.com',
      fecha: '2026-10-26',
      url: 'https://www.clarin.com/propiedades/ejemplo-zona-norte-m2',
      resumen: 'Ejemplo: relevamiento de precios de lotes y casas en Pilar, Tigre y Escobar con demanda sostenida.',
    },
    {
      titulo: 'Créditos hipotecarios: los bancos ajustan tasas y relación cuota-ingreso',
      medio: 'ambito.com',
      fecha: '2026-10-25',
      url: 'https://www.ambito.com/finanzas/ejemplo-creditos-hipotecarios-tasas',
      resumen: 'Ejemplo: varias entidades modificaron condiciones de sus líneas UVA para compra de vivienda.',
    },
    {
      titulo: 'Nueva normativa para alquileres: qué cambia para propietarios e inmobiliarias',
      medio: 'cronista.com',
      fecha: '2026-10-24',
      url: 'https://www.cronista.com/economia-politica/ejemplo-normativa-alquileres',
      resumen: 'Ejemplo: resumen de los cambios de regulación y su impacto sobre contratos y corretaje.',
    },
  ]
}

async function searchOne(apiKey: string, query: string): Promise<PerplexityResult[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS_PER_QUERY,
      search_recency_filter: 'week',
      country: 'AR',
      search_language_filter: ['es'],
      search_domain_filter: DOMAIN_FILTER,
      max_tokens_per_page: 1024,
    }),
  })
  if (!response.ok) {
    throw new Error(`Perplexity respondió ${response.status}`)
  }
  const data = await response.json()
  return Array.isArray(data?.results) ? data.results : []
}

export type ScanResult = { candidates: NewsCandidate[]; failedQueries: number }

/**
 * El mock SOLO se activa explícitamente: `opts.mock===true` (tests), o
 * `NEWS_SCAN_MOCK=1` Y `NODE_ENV !== 'production'` (prueba manual fuera de prod). Nunca
 * cae a mock por la sola ausencia de PERPLEXITY_API_KEY — ese era el riesgo real: una
 * noticia INVENTADA llegando a Diego en producción viola el anti-goal del spec ("nada
 * fabricado/falso llega a Diego"). Sin key y sin este flag, se lanza un error legible.
 */
function debeUsarMock(opts: { mock?: boolean }): boolean {
  if (opts.mock === true) return true
  return process.env.NEWS_SCAN_MOCK === '1' && process.env.NODE_ENV !== 'production'
}

// Igual que searchRealEstateNews pero informa cuántas queries fallaron
// (falla parcial), para que la UI distinga "sin noticias" de "la query falló".
export async function scanRealEstateNews(
  opts: { mock?: boolean } = {},
): Promise<ScanResult> {
  if (debeUsarMock(opts)) return { candidates: mockCandidates(), failedQueries: 0 }

  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error('Falta configurar PERPLEXITY_API_KEY: no se puede buscar noticias sin la clave de Perplexity.')
  }

  const seen = new Set<string>()
  const out: NewsCandidate[] = []
  let failures = 0
  let lastError = ''

  // En paralelo: las 7 queries a la vez, cada una con su propio AbortSignal.timeout(8000).
  // Secuencial (peor caso 7×8s=56s) pasaba el techo real de Netlify (~26s, ver CLAUDE.md
  // "REGLA DURA"). En paralelo el peor caso es ~8-9s.
  const settled = await Promise.allSettled(NEWS_QUERIES.map((query) => searchOne(apiKey, query)))

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const query = NEWS_QUERIES[i]
    if (outcome.status === 'rejected') {
      failures++
      lastError = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      console.warn(`[news/perplexity] query fallida "${query.slice(0, 50)}": ${lastError}`)
      continue
    }
    for (const r of outcome.value) {
      const c = toCandidate(r)
      if (!c || seen.has(c.url)) continue
      seen.add(c.url)
      out.push(c)
    }
  }

  if (failures === NEWS_QUERIES.length) {
    throw new Error(`No se pudo consultar Perplexity (${lastError}). Intentá de nuevo en unos minutos.`)
  }
  return { candidates: out, failedQueries: failures }
}

export async function searchRealEstateNews(
  opts: { mock?: boolean } = {},
): Promise<NewsCandidate[]> {
  return (await scanRealEstateNews(opts)).candidates
}
