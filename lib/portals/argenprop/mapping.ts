import type { Property } from '../types'

export interface ApPayload {
  operation: string
  propertyType: string
  title: string
  description: string
  price: { amount: number; currency: string }
  expenses?: { amount: number; currency: string }
  address: {
    street: string
    neighborhood: string
    city: string
    lat: number
    lng: number
    postalCode?: string
  }
  features: {
    rooms?: number
    bedrooms?: number
    bathrooms?: number
    garages?: number
    coveredArea?: number
    totalArea?: number
    age?: number
    floor?: number
    amenities: string[]
  }
  media: {
    photos: string[]
    videoUrl?: string
    tour3dUrl?: string
  }
}

function buildTitle(property: Property): string {
  if (property.title) return property.title
  return `${property.property_type || 'Propiedad'} en ${property.neighborhood}`
}

export function propertyToApPayload(property: Property): ApPayload {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToApPayload: lat/lng requeridos (corré validate antes)')
  }
  return {
    operation: property.operation_type || 'venta',
    propertyType: property.property_type || 'departamento',
    title: buildTitle(property),
    description: property.description || property.address,
    price: { amount: property.asking_price, currency: property.currency || 'USD' },
    expenses: property.expensas
      ? { amount: property.expensas, currency: 'ARS' }
      : undefined,
    address: {
      street: property.address,
      neighborhood: property.neighborhood,
      city: property.city || 'CABA',
      lat: property.latitude,
      lng: property.longitude,
      postalCode: property.postal_code ?? undefined,
    },
    features: {
      rooms: property.rooms ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      garages: property.garages ?? undefined,
      coveredArea: property.covered_area ?? undefined,
      totalArea: property.total_area ?? undefined,
      age: property.age ?? undefined,
      floor: property.floor ?? undefined,
      amenities: Array.isArray(property.amenities)
        ? (property.amenities as string[])
        : [],
    },
    media: {
      photos: property.photos ?? [],
      videoUrl: property.video_url ?? undefined,
      tour3dUrl: property.tour_3d_url ?? undefined,
    },
  }
}
