import 'server-only'
/**
 * Baja una página de resultados de un portal por ScraperAPI (1 crédito, sin render y SIN `country_code`: con
 * `country_code=ar` las fichas de Zonaprop daban 500; verificado 2026-10-22). Corte propio de 18 s: el del scraper
 * de tasaciones es de 30 s y pasa el techo de Netlify (~26 s), que respondería una página HTML de error.
 */
const TOPE_MS = 18_000

export async function traerListado(url: string): Promise<string> {
  const clave = process.env.SCRAPER_API_KEY
  if (!clave) throw new Error('Falta SCRAPER_API_KEY: no se pueden buscar competidoras')
  let res: Response
  try {
    res = await fetch(`https://api.scraperapi.com?api_key=${clave}&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(TOPE_MS) })
  } catch (e) {
    const tardo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new Error(tardo ? 'El portal tardó demasiado en responder' : 'No se pudo conectar con el portal')
  }
  if (res.status === 403) throw new Error('ScraperAPI sin créditos disponibles')
  if (!res.ok) throw new Error(`El portal no devolvió la página (HTTP ${res.status})`)
  const html = await res.text()
  if (html.length < 1000) throw new Error('El portal devolvió una página vacía o bloqueada')
  return html
}
