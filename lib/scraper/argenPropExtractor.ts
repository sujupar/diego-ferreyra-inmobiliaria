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
 * Extractor for ArgenProp listings
 */
export function extractArgenProp($: CheerioAPI, url: string): ScrapedProperty {
    // Title
    const title = getText($, [
        '.titlebar__title',
        'h1.property-title',
        '.posting-title'
    ]) || $('meta[property="og:title"]').attr('content') || ''

    // Price
    const priceText = getText($, [
        '.titlebar__price-value',
        '.titlebar__price',
        '.property-price'
    ])
    const { value: price, currency } = parsePrice(priceText)

    // Expenses
    const expensesText = getText($, [
        '.titlebar__expenses-value',
        '.titlebar__expenses',
        '.expenses span'
    ])
    const expenses = parseExpenses(expensesText)

    // Location
    const location = getText($, [
        '.titlebar__address',
        '.property-location',
        '.location-address'
    ])

    // Description
    const description = getText($, [
        '.section-description p',
        '.property-description',
        '#description'
    ]) || $('meta[property="og:description"]').attr('content') || ''

    // Features
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


    // Main features (icons row)
    $('.property-main-features li, .main-features li').each((_, el) => {
        const iconAlt = $(el).find('img').attr('alt')?.toLowerCase() || ''
        const text = $(el).text().toLowerCase()
        const value = cleanText($(el).find('.strong, strong, span').text())

        if (iconAlt.includes('total') || text.includes('total')) {
            features.totalArea = parseArea(text) || parseArea(value)
        } else if (iconAlt.includes('cubierta') || text.includes('cubierta')) {
            features.coveredArea = parseArea(text) || parseArea(value)
        } else if (iconAlt.includes('amb') || text.includes('amb')) {
            features.rooms = parseInteger(value) || parseInteger(text)
        } else if (iconAlt.includes('baño') || text.includes('baño')) {
            features.bathrooms = parseInteger(value) || parseInteger(text)
        } else if (iconAlt.includes('dorm') || text.includes('dorm')) {
            features.bedrooms = parseInteger(value) || parseInteger(text)
        }
    })

    // Detailed features
    $('.property-features li, .features-list li, .property-data li').each((_, el) => {
        const text = $(el).text().toLowerCase()

        if (text.includes('antigüedad')) {
            features.age = parseAge(text)
        } else if (text.includes('piso') && !text.includes('pisos')) {
            features.floor = parseFloor(text)
        } else if (text.includes('orientación')) {
            features.orientation = text.split(':').pop()?.trim() || null
        } else if (text.includes('disposición')) {
            features.disposal = text.split(':').pop()?.trim() || null
        } else if (text.includes('estado')) {
            features.condition = text.split(':').pop()?.trim() || null
        } else if (text.includes('dormitorio') && !features.bedrooms) {
            features.bedrooms = parseInteger(text)
        } else if (text.includes('baño') && !features.bathrooms) {
            features.bathrooms = parseInteger(text)
        }
    })

    // Images
    const images = extractImages($, [
        '.gallery-container img',
        '.property-gallery img',
        '.carousel img[src*="argenprop"]',
        '.slick-slide img'
    ])

    // Fallback to OG image
    if (images.length === 0) {
        const ogImage = $('meta[property="og:image"]').attr('content')
        if (ogImage) images.push(ogImage)
    }

    return {
        url,
        portal: 'Argenprop',
        title,
        description,
        location,
        price,
        currency,
        features,
        images
    }
}
