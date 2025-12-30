import { CheerioAPI } from 'cheerio'

/**
 * Parses price text and extracts value and currency
 * Examples: "USD 150.000", "U$S 150.000", "$ 45.000.000"
 */
export function parsePrice(text: string): { value: number | null; currency: 'USD' | 'ARS' | null } {
    if (!text) return { value: null, currency: null }

    const cleaned = text.replace(/\s+/g, ' ').trim()

    // Detect currency
    let currency: 'USD' | 'ARS' | null = null
    if (/USD|U\$S|u\$s|US\$/i.test(cleaned)) {
        currency = 'USD'
    } else if (/\$|ARS/i.test(cleaned)) {
        currency = 'ARS'
    }

    // Extract numeric value - handle both "150.000" and "150,000" formats
    const numericMatch = cleaned.match(/[\d.,]+/)
    if (numericMatch) {
        // Remove thousand separators (. in Spanish) and convert , to . for decimals
        const numStr = numericMatch[0]
            .replace(/\./g, '') // Remove thousand separators
            .replace(',', '.') // Convert decimal separator if present
        const value = parseFloat(numStr)
        if (!isNaN(value)) {
            return { value, currency }
        }
    }

    return { value: null, currency }
}

/**
 * Parses area text and extracts numeric value in m²
 * Examples: "87 m²", "87m2", "87 m2 totales"
 */
export function parseArea(text: string): number | null {
    if (!text) return null

    const match = text.match(/([\d.,]+)\s*m[²2]/i)
    if (match) {
        const numStr = match[1].replace('.', '').replace(',', '.')
        const value = parseFloat(numStr)
        return isNaN(value) ? null : value
    }
    return null
}

/**
 * Parses age text and extracts years
 * Examples: "45 años", "A estrenar", "40 años de antigüedad"
 */
export function parseAge(text: string): number | null {
    if (!text) return null

    const cleaned = text.toLowerCase()

    // Check for new construction
    if (cleaned.includes('estrenar') || cleaned.includes('nuevo')) {
        return 0
    }

    const match = text.match(/(\d+)\s*años?/i)
    if (match) {
        return parseInt(match[1], 10)
    }

    // Just a number (e.g., "40")
    const numMatch = text.match(/^\s*(\d+)\s*$/)
    if (numMatch) {
        return parseInt(numMatch[1], 10)
    }

    return null
}

/**
 * Parses integer values from text
 * Examples: "3 dormitorios", "2", "4 ambientes"
 */
export function parseInteger(text: string): number | null {
    if (!text) return null

    const match = text.match(/(\d+)/)
    if (match) {
        return parseInt(match[1], 10)
    }
    return null
}

/**
 * Parses expenses (expensas) text and extracts ARS value
 * Examples: "$ 310.000 expensas", "Expensas: $ 150.000"
 */
export function parseExpenses(text: string): number | null {
    if (!text) return null

    // Remove currency symbols and extract number
    const match = text.match(/\$?\s*([\d.,]+)/)
    if (match) {
        const numStr = match[1].replace(/\./g, '').replace(',', '.')
        const value = parseFloat(numStr)
        return isNaN(value) ? null : value
    }
    return null
}

/**
 * Cleans and normalizes text
 */
export function cleanText(text: string | null | undefined): string {
    if (!text) return ''
    return text.replace(/\s+/g, ' ').trim()
}

/**
 * Extracts floor number from text
 * Examples: "7mo piso", "Piso 3", "PB", "Planta Baja"
 */
export function parseFloor(text: string): number | null {
    if (!text) return null

    const cleaned = text.toLowerCase()

    // Ground floor
    if (cleaned.includes('pb') || cleaned.includes('planta baja') || cleaned.includes('bajo')) {
        return 0
    }

    // Numbered floor
    const match = text.match(/(\d+)/i)
    if (match) {
        return parseInt(match[1], 10)
    }

    return null
}

/**
 * Helper to get text from a selector, with fallback selectors
 */
export function getText($: CheerioAPI, selectors: string | string[]): string {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors]

    for (const selector of selectorList) {
        const text = $(selector).first().text()
        if (text) {
            return cleanText(text)
        }
    }
    return ''
}

/**
 * Helper to get attribute from a selector
 */
export function getAttr($: CheerioAPI, selector: string, attr: string): string | undefined {
    return $(selector).first().attr(attr)
}

/**
 * Extracts all image URLs from the page
 */
export function extractImages($: CheerioAPI, selectors: string[]): string[] {
    const images: string[] = []

    for (const selector of selectors) {
        $(selector).each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src')
            if (src && !images.includes(src)) {
                images.push(src)
            }
        })
    }

    return images
}

/**
 * Finds a value in a specs table by label
 */
export function findSpecByLabel($: CheerioAPI, rowSelector: string, labelSelector: string, valueSelector: string, labelText: string): string {
    let result = ''

    $(rowSelector).each((_, row) => {
        const label = $(row).find(labelSelector).text().toLowerCase()
        if (label.includes(labelText.toLowerCase())) {
            result = cleanText($(row).find(valueSelector).text())
            return false // break
        }
    })

    return result
}
