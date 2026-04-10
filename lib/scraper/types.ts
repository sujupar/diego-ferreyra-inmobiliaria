import { DispositionType, QualityType, ConservationStateType } from '@/lib/valuation/rules'

export interface PropertyFeatures {
    bedrooms: number | null
    bathrooms: number | null
    coveredArea: number | null      // Superficie Cubierta (100%)
    uncoveredArea: number | null    // Superficie Descubierta (50% para homologar)
    totalArea: number | null        // Solo para referencia, no se usa en cálculos
    age: number | null
    floor: number | null // 0 for PB
    totalFloors: number | null
    expenses: number | null
    orientation: string | null
    disposal: string | null // Frente, Contrafrente, etc. (legacy)
    condition: string | null // Estado (legacy)
    rooms?: number | null // Ambientes
    garages?: number | null
    views?: number | null // Visualizaciones (solo Zonaprop)
    publishedDate?: string | null // "Publicado hace X días"
    // Valuation-specific fields
    disposition?: DispositionType
    quality?: QualityType
    conservationState?: ConservationStateType
    locationCoefficient?: number  // J - Coeficiente de Ubicación (default 1.0)
    [key: string]: any
}


export interface ScrapedProperty {
    url: string
    title: string
    price: number | null
    currency: 'USD' | 'ARS' | null
    location: string
    description: string
    features: PropertyFeatures
    images: string[]
    portal: string
}


export interface ScraperResult {
    success: boolean
    data?: ScrapedProperty
    error?: string
}
