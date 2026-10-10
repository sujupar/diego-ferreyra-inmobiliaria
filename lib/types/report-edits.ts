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

    // Override MANUAL de los precios mostrados (independientes, sin recálculo de la
    // cadena derivada). undefined = usar el valor calculado. El de no-venta es el más
    // pedido. Las menciones de precio dentro de analysisText/strategyPriceText salen
    // del MARCADOR_PRECIO, que se resuelve con este override si existe.
    priceOverrides?: {
        publicationPrice?: number
        saleValue?: number
        noSaleZonePrice?: number
    }

    // Layout de páginas del PDF (editor de la vista previa). Index-based con guarda por
    // `pageCount`: el layout SOLO se aplica si el PDF renderizado tiene exactamente
    // `pageCount` páginas (misma estructura). Si el contenido cambió (otra cantidad de
    // páginas), se ignora de forma segura — nunca puede mapear mal una página.
    //  - order:  índices 0-based en el orden deseado (subconjunto/permutación de 0..pageCount-1)
    //  - hidden: índices 0-based a ocultar/borrar
    pdfLayout?: {
        order: number[]
        hidden: number[]
        pageCount: number
    }
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
 * Marcador que reemplaza al precio dentro de los textos del informe.
 *
 * POR QUÉ: los textos de análisis y estrategia se escribían con el precio del
 * momento en que se tocó "Calcular". Después el precio cambiaba (recálculo,
 * edición en la ficha, precio cargado a mano) y el texto no: en la auditoría
 * del 2026-10-03, 18 de 53 informes decían un precio en el texto y otro en el
 * recuadro. Con el marcador, el precio del texto se resuelve al mostrar el
 * informe y siempre es el vigente.
 */
export const MARCADOR_PRECIO = '{precio}'

/**
 * Las dos frases de fábrica que llevaban el precio escrito como número. Solo
 * esas se convierten: un precio que el asesor escribió en otra frase (ej. "la
 * otra inmobiliaria la tasó en USD 225.000") es contenido suyo y no se toca.
 * El número admite el formato que generaba el sistema: "USD 252.000",
 * "ARS 95.000.000", "$ 1.000".
 */
const FRASES_CON_PRECIO = /(se debería publicar en |El valor de publicación recomendado es: )(?:USD|ARS|U\$S|\$)\s?\d{1,3}(?:\.\d{3})*/g

/** Pasa al marcador el precio escrito en las frases de fábrica. */
export function conMarcadorDePrecio(texto: string | undefined | null): string {
    if (!texto) return ''
    return texto.replace(FRASES_CON_PRECIO, `$1${MARCADOR_PRECIO}`)
}

/** El texto tal como se muestra: con el precio vigente en lugar del marcador. */
export function textoConPrecio(texto: string | undefined | null, precioFormateado: string): string {
    return conMarcadorDePrecio(texto).split(MARCADOR_PRECIO).join(precioFormateado)
}

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/**
 * Lo que hace "Calcular" con las ediciones del informe: completa SOLO lo que
 * está vacío con los textos de fábrica.
 *
 * POR QUÉ: antes "Calcular" reemplazaba las ediciones enteras y se perdían los
 * textos editados, los precios cargados a mano (incluida la Zona de No Venta),
 * los semáforos y el orden de páginas del PDF — y quedaba guardado así.
 */
export function completarEdiciones(actual: ReportEdits, porDefecto: ReportEdits): ReportEdits {
    const resultado: ReportEdits = { ...actual, semaphoreOverrides: actual.semaphoreOverrides ?? {} }
    for (const clave of Object.keys(porDefecto) as (keyof ReportEdits)[]) {
        if (vacio(resultado[clave])) {
            Object.assign(resultado, { [clave]: porDefecto[clave] })
        }
    }
    resultado.analysisText = resultado.analysisText && conMarcadorDePrecio(resultado.analysisText)
    resultado.strategyPriceText = resultado.strategyPriceText && conMarcadorDePrecio(resultado.strategyPriceText)
    return resultado
}

/**
 * Build pre-filled ReportEdits from valuation data.
 * All text fields are populated with real data so the editor shows filled content.
 * Los precios dentro de los textos van como MARCADOR_PRECIO (ver arriba).
 */
export function buildDefaultEdits(
    subject: { title?: string; location?: string; description?: string },
    _valuationResult: { publicationPrice: number; currency: string; noSaleZonePrice?: number }
): ReportEdits {
    const formattedPrice = MARCADOR_PRECIO

    return {
        semaphoreOverrides: {},

        coverTitle: 'INFORME DE TASACIÓN',
        coverPropertyTitle: subject.location || subject.title || '',

        propertyDescription: strip(subject.description),

        semaphoreIntroText: 'En el camino hacia la venta exitosa, es clave estar en la zona correcta.\n\nQueremos que tu propiedad brille en la zona verde, donde las oportunidades se convierten en resultados, donde los sueños de los compradores coinciden con tu necesidad de vender.',

        analysisMethodText: 'Para tasar la propiedad se utilizó el método de comparables. Se toman propiedades similares a valor correcto de mercado y se comparan variables como superficie, ubicación, piso, disposición, antigüedad, estado de conservación y calidad constructiva.',

        analysisText: `Debido a la competencia para tener visitas y potencial de venta la propiedad se debería publicar en ${formattedPrice}.\n\nUna buena tasación siempre es vender al mejor valor que el mercado convalide en un plazo de 2 meses.`,

        strategyPriceText: `El valor de publicación recomendado es: ${formattedPrice}.\n\nHoy las propiedades que están en un valor interesante para el mercado tienen cerca de 8 visitas mensuales y con el método por etapas, cada 10 visitas hay una reserva en promedio.`,

        strategyDiffusionText: 'Tu propiedad merece tener máxima difusión. Que la vean en excelencia, todos los potenciales compradores. Para ello haremos fotos, video, tour virtual con profesional, publicaremos en todos los portales inmobiliarios de forma destacada, crearemos una página web para la propiedad y haremos campañas publicitarias en las redes sociales. Con esta estrategia tu propiedad la verán el triple de potenciales compradores.\n\nSi tenés el precio adecuado y máxima difusión, vas a tener consultas y visitas a tu propiedad.',

        strategyFollowupText: 'Cada 15 días se harán informes de gestión quincenal donde te enviaremos las métricas de los portales, la información que dejaron los compradores en la ficha de visitas y un análisis con la mejora que debemos realizar en la estrategia para lograr vender en los próximos 15 días.',

        authorizationText: 'La autorización es exclusiva y la propiedad se compartirá con todas las inmobiliarias. Seré el máximo responsable e interlocutor principal para que se logre la operación exitosamente. El plazo de la autorización para conseguir resultados óptimos es de 120 días.',

        feesText: 'La retribución en concepto de honorarios por el servicio a brindar es del 3% (tres por ciento), calculado sobre el monto de venta final de la operación.',
    }
}
