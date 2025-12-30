export interface PropertyFeatures {
    bedrooms: number | null
    bathrooms: number | null
    totalArea: number | null
    coveredArea: number | null
    age: number | null
    floor: number | null // 0 for PB
    totalFloors: number | null
    expenses: number | null
    orientation: string | null
    disposal: string | null // Frente, Contrafrente, etc.
    condition: string | null // Estado
    rooms?: number | null // Ambientes
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
