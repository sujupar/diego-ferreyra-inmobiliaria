import { CheerioAPI } from 'cheerio'
import { ScrapedProperty, PropertyFeatures } from './types'
import { completarDescubiertaDeducida } from './superficie-deducida'
import {
    parsePrice,
    parseArea,
    parseAge,
    parseInteger,
    parseExpenses,
    parseFloor,
    parsePublishedDate,
    normalizePublishedText,
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

    // Expensas: de su fila en la tabla (más abajo) o del bloque propio. NO de '.ui-pdp-price__second-line': en la
    // ficha actual esa línea repite el PRECIO, y un depto de USD 95.000 salía con expensas de 95.000 (2026-10-22).
    const expensesText = getText($, ['.ui-pdp-maintenance-fee-wrapper'])
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
    // La ficha actual trae el nombre en <th> y el valor en <td> (las clases __label/__value ya no existen: con ellas
    // TODAS las características salían vacías, verificado contra MLA-2073595273 el 2026-10-22).
    $('.ui-vpp-striped-specs__row').each((_, row) => {
        const label = ($(row).find('.ui-vpp-striped-specs__label').text() || $(row).find('th').text()).toLowerCase()
        const value = cleanText($(row).find('.ui-vpp-striped-specs__value').text() || $(row).find('td').text())

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
        } else if (label.includes('expensas') && !features.expenses) {
            features.expenses = parseExpenses(value)
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

    // Descubierta deducida (total − cubierta) cuando el portal no la informa:
    // queda marcada para que el editor pida revisarla (B9).
    Object.assign(features, completarDescubiertaDeducida(features))

    // Published date - MercadoLibre specific
    const pubDateText = getText($, [
        '.ui-pdp-header__bottom-info',
        '.ui-pdp-header__title-container time',
        '[class*="publishing-date"]',
    ])
    if (pubDateText) {
        features.publishedDate = normalizePublishedText(parsePublishedDate(pubDateText))
    }
    // Fallback: search for "Publicado hace" text
    if (!features.publishedDate) {
        $('span, p, div, time').each((_, el) => {
            const t = $(el).text()
            if (t.toLowerCase().includes('publicado') || (t.toLowerCase().includes('hace') && t.toLowerCase().match(/d[ií]as?|meses?|años?/))) {
                const d = normalizePublishedText(parsePublishedDate(t))
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
