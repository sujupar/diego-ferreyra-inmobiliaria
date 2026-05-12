import type { Property } from '../types'

export interface ZpPayload {
  operationType: string
  propertyType: string
  title: string
  description: string
  price: number
  currency: string
  expenses?: number
  location: {
    address: string
    neighborhood: string
    city: string
    latitude: number
    longitude: number
    postalCode?: string
  }
  characteristics: {
    rooms?: number
    bedrooms?: number
    bathrooms?: number
    parkings?: number
    coveredSurface?: number
    totalSurface?: number
    floor?: number
    age?: number
  }
  amenities: string[]
  photos: string[]
  videoUrl?: string
  virtualTourUrl?: string
}

function buildTitle(property: Property): string {
  if (property.title) return property.title
  return `${property.property_type || 'Propiedad'} en ${property.neighborhood}`
}

export function propertyToZpPayload(property: Property): ZpPayload {
  return {
    operationType: property.operation_type || 'venta',
    propertyType: property.property_type || 'departamento',
    title: buildTitle(property),
    description: property.description || property.address,
    price: property.asking_price,
    currency: property.currency || 'USD',
    expenses: property.expensas ?? undefined,
    location: {
      address: property.address,
      neighborhood: property.neighborhood,
      city: property.city || 'CABA',
      latitude: property.latitude!,
      longitude: property.longitude!,
      postalCode: property.postal_code ?? undefined,
    },
    characteristics: {
      rooms: property.rooms ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      parkings: property.garages ?? undefined,
      coveredSurface: property.covered_area ?? undefined,
      totalSurface: property.total_area ?? undefined,
      floor: property.floor ?? undefined,
      age: property.age ?? undefined,
    },
    amenities: Array.isArray(property.amenities)
      ? (property.amenities as string[])
      : [],
    photos: property.photos ?? [],
    videoUrl: property.video_url ?? undefined,
    virtualTourUrl: property.tour_3d_url ?? undefined,
  }
}
