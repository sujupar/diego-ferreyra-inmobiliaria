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
