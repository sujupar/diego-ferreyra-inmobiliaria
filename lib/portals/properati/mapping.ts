import type { Property } from '../types'

export interface PropertiPayload {
  operation: string
  type: string
  title: string
  description: string
  price: { value: number; currency: string }
  expenses?: number
  location: {
    address: string
    neighborhood: string
    city: string
    lat: number
    lng: number
    postal_code?: string
  }
  features: {
    rooms?: number
    bedrooms?: number
    bathrooms?: number
    parking?: number
    surface_covered?: number
    surface_total?: number
    floor?: number
    age?: number
    amenities: string[]
  }
  photos: string[]
  video_url?: string
  virtual_tour_url?: string
}

function buildTitle(property: Property): string {
  if (property.title) return property.title
  return `${property.property_type || 'Propiedad'} en ${property.neighborhood}`
}

export function propertyToPropertiPayload(property: Property): PropertiPayload {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToPropertiPayload: lat/lng requeridos')
  }
  return {
    operation: property.operation_type || 'venta',
    type: property.property_type || 'departamento',
    title: buildTitle(property),
    description: property.description || property.address,
    price: { value: property.asking_price, currency: property.currency || 'USD' },
    expenses: property.expensas ?? undefined,
    location: {
      address: property.address,
      neighborhood: property.neighborhood,
      city: property.city || 'CABA',
      lat: property.latitude,
      lng: property.longitude,
      postal_code: property.postal_code ?? undefined,
    },
    features: {
      rooms: property.rooms ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      parking: property.garages ?? undefined,
      surface_covered: property.covered_area ?? undefined,
      surface_total: property.total_area ?? undefined,
      floor: property.floor ?? undefined,
      age: property.age ?? undefined,
      amenities: Array.isArray(property.amenities)
        ? (property.amenities as string[])
        : [],
    },
    photos: property.photos ?? [],
    video_url: property.video_url ?? undefined,
    virtual_tour_url: property.tour_3d_url ?? undefined,
  }
}
