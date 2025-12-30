import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import * as cheerio from 'cheerio'
import { ScrapedProperty, ScraperResult } from './types'
import { extractZonaProp } from './zonaPropExtractor'
import { extractArgenProp } from './argenPropExtractor'
import { extractMercadoLibre } from './mercadoLibreExtractor'

// Enable stealth plugin to bypass bot detection
puppeteer.use(StealthPlugin())

type Portal = 'Zonaprop' | 'Argenprop' | 'MercadoLibre' | 'Unknown'

/**
 * Scrapes a property listing from supported real estate portals
 */
export async function scrapeProperty(url: string): Promise<ScraperResult> {
    let browser = null

    try {
        const portal = detectPortal(url)

        if (portal === 'Unknown') {
            return {
                success: false,
                error: `Unsupported portal. Please use ZonaProp, ArgenProp, or MercadoLibre URLs.`
            }
        }

        console.log(`[Scraper] Starting scrape for ${portal}: ${url}`)

        // Launch Puppeteer with stealth to avoid bot detection
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
        })
        const page = await browser.newPage()

        // Set viewport to look like a real browser
        await page.setViewport({ width: 1920, height: 1080 })

        // Set user agent to avoid bot detection
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        })

        // Navigate and wait for content
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })

        // Wait a bit for dynamic content
        await new Promise(resolve => setTimeout(resolve, 2000))

        // For MercadoLibre, click "Ver todas las características" if present
        if (portal === 'MercadoLibre') {
            try {
                await page.waitForSelector('.ui-pdp-collapsable__action', { timeout: 5000 })
                await page.click('.ui-pdp-collapsable__action')
                await new Promise(resolve => setTimeout(resolve, 1000))
            } catch {
                // Button not found or already expanded - continue
            }
        }

        // For ArgenProp, wait for the main content
        if (portal === 'Argenprop') {
            try {
                await page.waitForSelector('.titlebar__price', { timeout: 10000 })
            } catch {
                console.log('[Scraper] ArgenProp: Price element not found, continuing anyway')
            }
        }

        // Get page content
        const content = await page.content()
        const $ = cheerio.load(content)

        // Extract using portal-specific extractor
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
    } finally {
        if (browser) await browser.close()
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
