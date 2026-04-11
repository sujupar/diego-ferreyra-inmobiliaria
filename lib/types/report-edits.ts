export type SemaphoreColor = 'green' | 'yellow' | 'red'

export interface ReportEdits {
    // Semáforos por propiedad: key = "comparable-0", "overpriced-1", etc.
    semaphoreOverrides: Record<string, SemaphoreColor>

    // Portada
    coverTitle?: string
    coverPropertyTitle?: string

    // Propiedad a tasar
    propertyDescription?: string
    propertyHighlights?: string[]

    // Semáforo del mercado
    semaphoreIntroText?: string

    // Mapa de Valor
    analysisMethodText?: string
    analysisText?: string

    // Estrategia
    strategyPriceText?: string
    strategyDiffusionText?: string
    strategyFollowupText?: string

    // Autorización y Honorarios
    authorizationText?: string
    feesText?: string

    // Overrides por propiedad
    comparableOverrides?: Record<number, { title?: string; description?: string }>
    overpricedOverrides?: Record<number, { title?: string }>
    purchaseOverrides?: Record<number, { title?: string }>
}

export const DEFAULT_REPORT_EDITS: ReportEdits = {
    semaphoreOverrides: {},
}

/** Strip HTML tags and clean text */
function strip(str: string | undefined | null, maxLen: number = 500): string {
    if (!str) return ''
    return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

/**
 * Build pre-filled ReportEdits from valuation data.
 * All text fields are populated with real data so the editor shows filled content.
 */
export function buildDefaultEdits(
    subject: { title?: string; location?: string; description?: string },
    valuationResult: { publicationPrice: number; currency: string; noSaleZonePrice?: number }
): ReportEdits {
    const price = valuationResult.publicationPrice
    const currency = valuationResult.currency || 'USD'
    const formattedPrice = `${currency} ${price.toLocaleString('es-AR')}`

    return {
        semaphoreOverrides: {},

        coverTitle: 'INFORME DE TASACIÓN',
        coverPropertyTitle: subject.location || subject.title || '',

        propertyDescription: strip(subject.description),

        semaphoreIntroText: 'En el camino hacia la venta exitosa, es clave estar en la zona correcta.\n\nQueremos que tu propiedad brille en la zona verde, donde las oportunidades se convierten en resultados, donde los sueños de los compradores coinciden con tu necesidad de vender.',

        analysisMethodText: 'Para tasar la propiedad se utilizó el método de comparables. Se toman propiedades similares a valor correcto de mercado y se comparan variables como superficie, ubicación, piso, disposición, antigüedad, estado de conservación y calidad constructiva.',

        analysisText: `Debido a la competencia para tener visitas y potencial de venta la propiedad se debería publicar en ${formattedPrice}.\n\nUna buena tasación, siempre es, vender al mejor valor que el mercado convalide en un plazo de 2 meses.`,

        strategyPriceText: `El valor de publicación recomendado es: ${formattedPrice}.\n\nHoy las propiedades que están en un valor interesante para el mercado tienen cerca de 8 visitas mensuales y con el método por etapas, cada 10 visitas hay una reserva en promedio.`,

        strategyDiffusionText: 'Tu propiedad merece tener máxima difusión. Que la vean en excelencia, todos los potenciales compradores. Para ello haremos fotos, video, tour virtual con profesional, publicaremos en todos los portales inmobiliarios de forma destacada, crearemos una página web para la propiedad y haremos campañas publicitarias en las redes sociales. Con esta estrategia tu propiedad la verán el triple de potenciales compradores.\n\nSi tenes el precio adecuado y máxima difusión, vas a tener consultas y visitas a tu propiedad.',

        strategyFollowupText: 'Cada 15 días se harán informes de gestión quincenal donde te enviaremos las métricas de los portales, la información que dejaron los compradores en la ficha de visitas y un análisis con la mejora que debemos realizar en la estrategia para lograr vender en los próximos 15 días.',

        authorizationText: 'La autorización es exclusiva y la propiedad se compartirá con todas las inmobiliarias. Seré el máximo responsable e interlocutor principal para que se logre la operación exitosamente. El plazo de la autorización para conseguir resultados óptimos es de 120 días.',

        feesText: 'La retribución en concepto de honorarios por el servicio a brindar es del 3% (tres por ciento), calculado sobre el monto de venta final de la operación.',
    }
}
