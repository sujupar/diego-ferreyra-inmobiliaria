import { CheerioAPI } from 'cheerio'
import { ScrapedProperty, PropertyFeatures } from './types'
import {
    parsePrice,
    parseArea,
    parseAge,
    parseInteger,
    parseExpenses,
    parseFloor,
    getText,
    extractImages,
    cleanText
} from './extractorUtils'

/**
 * Extractor for ZonaProp listings
 */
export function extractZonaProp($: CheerioAPI, url: string): ScrapedProperty {
    // Title
    const title = getText($, [
        'h1.title-type-sup-property',
        '.posting-title h1',
        'meta[property="og:title"]'
    ]) || $('meta[property="og:title"]').attr('content') || ''

    // Price
    const priceText = getText($, [
        '.price-value',
        '.price-items .price',
        '[class*="PriceContainer"] [class*="price"]'
    ])
    const { value: price, currency } = parsePrice(priceText)

    // Expenses
    const expensesText = getText($, [
        '.expensas-value',
        '[class*="Expenses"]',
        '.block-expensas span'
    ])
    const expenses = parseExpenses(expensesText)

    // Location
    const location = getText($, [
        '.section-location-property-title',
        '.location-container h2',
        '.posting-location'
    ])

    // Description
    const description = getText($, [
        '.section-description--content',
        '.description-content',
        '#description-content'
    ]) || $('meta[property="og:description"]').attr('content') || ''

    // Features - look for the features list
    const features: PropertyFeatures = {
        bedrooms: null,
        bathrooms: null,
        totalArea: null,
        coveredArea: null,
        age: null,
        floor: null,
        totalFloors: null,
        expenses,
        orientation: null,
        disposal: null,
        condition: null,
        rooms: null
    }


    // Parse feature items
    $('.section-icon-features li, .icon-features li, [class*="Features"] li').each((_, el) => {
        const text = $(el).text().toLowerCase()
        const value = cleanText($(el).find('span, .data, strong').text())

        if (text.includes('total') && text.includes('m')) {
            features.totalArea = parseArea(text) || parseArea(value)
        } else if (text.includes('cubierta') || text.includes('cub')) {
            features.coveredArea = parseArea(text) || parseArea(value)
        } else if (text.includes('amb')) {
            features.rooms = parseInteger(text) || parseInteger(value)
        } else if (text.includes('dorm') || text.includes('habit')) {
            features.bedrooms = parseInteger(text) || parseInteger(value)
        } else if (text.includes('baño')) {
            features.bathrooms = parseInteger(text) || parseInteger(value)
        } else if (text.includes('antigüedad') || text.includes('años')) {
            features.age = parseAge(text) || parseAge(value)
        } else if (text.includes('piso') && !text.includes('pisos')) {
            features.floor = parseFloor(text) || parseFloor(value)
        } else if (text.includes('orientación')) {
            features.orientation = value || text.split(':').pop()?.trim() || null
        } else if (text.includes('disposición')) {
            features.disposal = value || text.split(':').pop()?.trim() || null
        }
    })

    // Also check the detailed features section
    $('.section-data-property li, .property-features li').each((_, el) => {
        const text = $(el).text().toLowerCase()

        if (text.includes('total') && features.totalArea === null) {
            features.totalArea = parseArea(text)
        }
        if (text.includes('cubierta') && features.coveredArea === null) {
            features.coveredArea = parseArea(text)
        }
        if (text.includes('antigüedad') && features.age === null) {
            features.age = parseAge(text)
        }
        if (text.includes('orientación') && !features.orientation) {
            features.orientation = text.split(':').pop()?.trim() || null
        }
        if (text.includes('disposición') && !features.disposal) {
            features.disposal = text.split(':').pop()?.trim() || null
        }
    })

    // Images
    const images = extractImages($, [
        '.gallery-section img',
        '.carousel-inner img',
        'picture img[src*="zonaprop"]',
        '[class*="Gallery"] img'
    ])

    // Fallback to OG image
    if (images.length === 0) {
        const ogImage = $('meta[property="og:image"]').attr('content')
        if (ogImage) images.push(ogImage)
    }

    return {
        url,
        portal: 'Zonaprop',
        title,
        description,
        location,
        price,
        currency,
        features,
        images
    }
}
