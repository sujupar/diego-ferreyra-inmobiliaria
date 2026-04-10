import { CheerioAPI } from 'cheerio'
import { ScrapedProperty, PropertyFeatures } from './types'
import {
    parsePrice,
    parseArea,
    parseAge,
    parseInteger,
    parseExpenses,
    parseFloor,
    parsePublishedDate,
    getText,
    extractImages,
    cleanText
} from './extractorUtils'

/**
 * Extractor for MercadoLibre Inmuebles listings
 */
export function extractMercadoLibre($: CheerioAPI, url: string): ScrapedProperty {
    // Title
    const title = getText($, [
        '.ui-pdp-title',
        'h1.ui-pdp-title',
        '.vip-section-title h1'
    ]) || $('meta[property="og:title"]').attr('content') || ''

    // Price
    const currencySymbol = getText($, [
        '.andes-money-amount__currency-symbol',
        '.ui-pdp-price .andes-money-amount__currency-symbol'
    ])
    const priceValue = getText($, [
        '.ui-pdp-price__main-container .andes-money-amount__fraction',
        '.andes-money-amount__fraction'
    ])

    let price: number | null = null
    let currency: 'USD' | 'ARS' | null = null

    if (priceValue) {
        // Remove thousand separators
        const numStr = priceValue.replace(/\./g, '').replace(',', '.')
        price = parseFloat(numStr)
        if (isNaN(price)) price = null
    }

    if (currencySymbol) {
        if (currencySymbol.includes('US') || currencySymbol.includes('U$')) {
            currency = 'USD'
        } else {
            currency = 'ARS'
        }
    }

    // Expenses
    const expensesText = getText($, [
        '.ui-pdp-maintenance-fee-wrapper',
        '.ui-pdp-price__second-line'
    ])
    const expenses = parseExpenses(expensesText)

    // Location
    const location = getText($, [
        '.ui-pdp-media__title',
        '.ui-vpp-location-container .ui-pdp-media__title',
        '.ui-pdp-container__row--location .ui-pdp-media__title'
    ])

    // Description
    const description = getText($, [
        '.ui-pdp-description__content',
        '.ui-pdp-description p'
    ]) || $('meta[property="og:description"]').attr('content') || ''

    // Features - from the striped specs table
    const features: PropertyFeatures = {
        bedrooms: null,
        bathrooms: null,
        coveredArea: null,
        uncoveredArea: null,
        totalArea: null,
        age: null,
        floor: null,
        totalFloors: null,
        expenses,
        orientation: null,
        disposal: null,
        condition: null,
        rooms: null
    }


    // Parse specs table rows
    $('.ui-vpp-striped-specs__row').each((_, row) => {
        const label = $(row).find('.ui-vpp-striped-specs__label').text().toLowerCase()
        const value = cleanText($(row).find('.ui-vpp-striped-specs__value').text())

        if (label.includes('superficie total')) {
            features.totalArea = parseArea(value)
        } else if (label.includes('superficie cubierta')) {
            features.coveredArea = parseArea(value)
        } else if (label.includes('ambientes')) {
            features.rooms = parseInteger(value)
        } else if (label.includes('dormitorios')) {
            features.bedrooms = parseInteger(value)
        } else if (label.includes('baños')) {
            features.bathrooms = parseInteger(value)
        } else if (label.includes('antigüedad')) {
            features.age = parseAge(value)
        } else if (label.includes('número de piso') || label.includes('piso de la unidad')) {
            features.floor = parseFloor(value)
        } else if (label.includes('orientación')) {
            features.orientation = value
        } else if (label.includes('disposición')) {
            features.disposal = value
        } else if (label.includes('estado')) {
            features.condition = value
        }
    })

    // Also check highlighted specs (quick view icons)
    $('.ui-vpp-highlighted-specs__key-value').each((_, el) => {
        const text = $(el).text().toLowerCase()

        if (text.includes('m²') && !text.includes('balc')) {
            if (!features.totalArea) {
                features.totalArea = parseArea(text)
            }
        }
        if (text.includes('amb') && !features.rooms) {
            features.rooms = parseInteger(text)
        }
        if (text.includes('dorm') && !features.bedrooms) {
            features.bedrooms = parseInteger(text)
        }
        if (text.includes('baño') && !features.bathrooms) {
            features.bathrooms = parseInteger(text)
        }
    })

    // Derive uncovered area when portal only exposes total + covered
    if (features.uncoveredArea === null && features.totalArea !== null && features.coveredArea !== null) {
        const diff = features.totalArea - features.coveredArea
        features.uncoveredArea = diff > 0 ? diff : 0
    }

    // Published date - MercadoLibre specific
    const pubDateText = getText($, [
        '.ui-pdp-header__bottom-info',
        '.ui-pdp-header__title-container time',
        '[class*="publishing-date"]',
    ])
    if (pubDateText) {
        features.publishedDate = parsePublishedDate(pubDateText)
    }
    // Fallback: search for "Publicado hace" text
    if (!features.publishedDate) {
        $('span, p, div, time').each((_, el) => {
            const t = $(el).text()
            if (t.toLowerCase().includes('publicado') || (t.toLowerCase().includes('hace') && t.toLowerCase().match(/d[ií]as?|meses?|años?/))) {
                const d = parsePublishedDate(t)
                if (d) {
                    features.publishedDate = d
                    return false
                }
            }
        })
    }

    // Images
    const images = extractImages($, [
        '.ui-pdp-gallery__figure img',
        '.ui-pdp-image img',
        '.slick-slide img',
        'figure img[src*="mlstatic"]'
    ])

    // Fallback to OG image
    if (images.length === 0) {
        const ogImage = $('meta[property="og:image"]').attr('content')
        if (ogImage) images.push(ogImage)
    }

    return {
        url,
        portal: 'MercadoLibre',
        title,
        description,
        location,
        price,
        currency,
        features,
        images
    }
}
