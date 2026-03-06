import * as cheerio from 'cheerio'
import { ScrapedProperty, ScraperResult } from './types'
import { extractZonaProp } from './zonaPropExtractor'
import { extractArgenProp } from './argenPropExtractor'
import { extractMercadoLibre } from './mercadoLibreExtractor'

type Portal = 'Zonaprop' | 'Argenprop' | 'MercadoLibre' | 'Unknown'

const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
]

const DIRECT_TIMEOUT_MS = 8_000
const SCRAPERAPI_TIMEOUT_MS = 30_000
const MAX_RETRIES = 1

/**
 * Fetches HTML from a URL.
 * Uses ScraperAPI proxy when SCRAPER_API_KEY is set (production),
 * falls back to direct fetch (local dev).
 */
async function fetchHTML(url: string): Promise<string> {
    const apiKey = process.env.SCRAPER_API_KEY

    if (apiKey) {
        return fetchViaScraperAPI(url, apiKey)
    }
    return fetchDirect(url)
}

/**
 * Fetches HTML through ScraperAPI proxy (handles proxies, CAPTCHAs, retries)
 */
async function fetchViaScraperAPI(url: string, apiKey: string): Promise<string> {
    const proxyUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SCRAPERAPI_TIMEOUT_MS)

    try {
        console.log(`[Scraper] Fetching via ScraperAPI: ${url}`)

        const response = await fetch(proxyUrl, {
            method: 'GET',
            signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!response.ok) {
            throw new Error(`ScraperAPI HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()

        if (html.length < 1000) {
            throw new Error('Response too short - page may be blocked or empty')
        }

        console.log(`[Scraper] ScraperAPI success - received ${html.length} chars`)
        return html

    } catch (error) {
        clearTimeout(timeout)
        const isAbort = (error as Error).name === 'AbortError'
        throw new Error(
            isAbort
                ? 'Request timed out. The portal may be slow — try again.'
                : (error as Error).message
        )
    }
}

/**
 * Fetches HTML directly with retry logic (for local development)
 */
async function fetchDirect(url: string): Promise<string> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const userAgent = USER_AGENTS[attempt % USER_AGENTS.length]
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS)

        try {
            console.log(`[Scraper] Direct fetch attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${url}`)

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
                signal: controller.signal,
                redirect: 'follow',
            })

            clearTimeout(timeout)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const html = await response.text()

            if (html.length < 1000) {
                throw new Error('Response too short - likely blocked or empty page')
            }

            return html

        } catch (error) {
            clearTimeout(timeout)
            lastError = error as Error

            const isAbort = (error as Error).name === 'AbortError'
            console.warn(
                `[Scraper] Attempt ${attempt + 1} failed: ${isAbort ? 'Timeout' : (error as Error).message}`
            )

            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        }
    }

    throw new Error(
        `Failed to fetch page after ${MAX_RETRIES + 1} attempts. Last error: ${lastError?.message}. ` +
        `The portal may be blocking automated requests. Try entering property data manually.`
    )
}

/**
 * Scrapes a property listing from supported real estate portals
 */
export async function scrapeProperty(url: string): Promise<ScraperResult> {
    try {
        const portal = detectPortal(url)

        if (portal === 'Unknown') {
            return {
                success: false,
                error: 'Unsupported portal. Please use ZonaProp, ArgenProp, or MercadoLibre URLs.'
            }
        }

        console.log(`[Scraper] Starting scrape for ${portal}: ${url}`)

        const html = await fetchHTML(url)
        const $ = cheerio.load(html)

        let property: ScrapedProperty

        switch (portal) {
            case 'Zonaprop':
                property = extractZonaProp($, url)
                break
            case 'Argenprop':
                property = extractArgenProp($, url)
                break
            case 'MercadoLibre':
                property = extractMercadoLibre($, url)
                break
            default:
                throw new Error('Unknown portal')
        }

        console.log(`[Scraper] Successfully extracted data from ${portal}`)
        console.log(`[Scraper] Price: ${property.currency} ${property.price}`)
        console.log(`[Scraper] Features:`, property.features)

        return { success: true, data: property }

    } catch (error) {
        console.error('[Scraper] Error:', error)
        return { success: false, error: (error as Error).message }
    }
}

/**
 * Detects which portal a URL belongs to
 */
function detectPortal(url: string): Portal {
    const lowerUrl = url.toLowerCase()

    if (lowerUrl.includes('zonaprop.com')) return 'Zonaprop'
    if (lowerUrl.includes('argenprop.com')) return 'Argenprop'
    if (lowerUrl.includes('mercadolibre.com')) return 'MercadoLibre'

    return 'Unknown'
}
