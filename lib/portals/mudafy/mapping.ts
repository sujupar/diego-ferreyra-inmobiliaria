import type { Property } from '../types'

export interface MudafyPayload {
  operationType: string
  propertyType: string
  title: string
  description: string
  price: { amount: number; currency: string }
  expenses?: { amount: number; currency: string }
  location: {
    address: string
    neighborhood: string
    city: string
    coordinates: { lat: number; lng: number }
    postalCode?: string
  }
  details: {
    rooms?: number
    bedrooms?: number
    bathrooms?: number
    parkingSpaces?: number
    coveredAreaM2?: number
    totalAreaM2?: number
    floor?: number
    ageYears?: number
    amenities: string[]
  }
  media: {
    photos: string[]
    videoUrl?: string
    virtualTourUrl?: string
  }
}

function buildTitle(property: Property): string {
  if (property.title) return property.title
  return `${property.property_type || 'Propiedad'} en ${property.neighborhood}`
}

export function propertyToMudafyPayload(property: Property): MudafyPayload {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToMudafyPayload: lat/lng requeridos')
  }
  return {
    operationType: property.operation_type || 'venta',
    propertyType: property.property_type || 'departamento',
    title: buildTitle(property),
    description: property.description || property.address,
    price: { amount: property.asking_price, currency: property.currency || 'USD' },
    expenses: property.expensas
      ? { amount: property.expensas, currency: 'ARS' }
      : undefined,
    location: {
      address: property.address,
      neighborhood: property.neighborhood,
      city: property.city || 'CABA',
      coordinates: { lat: property.latitude, lng: property.longitude },
      postalCode: property.postal_code ?? undefined,
    },
    details: {
      rooms: property.rooms ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      parkingSpaces: property.garages ?? undefined,
      coveredAreaM2: property.covered_area ?? undefined,
      totalAreaM2: property.total_area ?? undefined,
      floor: property.floor ?? undefined,
      ageYears: property.age ?? undefined,
      amenities: Array.isArray(property.amenities)
        ? (property.amenities as string[])
        : [],
    },
    media: {
      photos: property.photos ?? [],
      videoUrl: property.video_url ?? undefined,
      virtualTourUrl: property.tour_3d_url ?? undefined,
    },
  }
}
