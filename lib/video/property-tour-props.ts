/**
 * Convierte una Property en los props que necesita la Composition
 * `PropertyTour` de Remotion. Determinístico, sin I/O.
 */
import type { Property } from '@/lib/portals/types'
import type { PropertyTourProps } from '@/remotion/PropertyTour'

const OPERATION_VERB: Record<string, string> = {
  venta: 'En venta',
  alquiler: 'En alquiler',
  temporario: 'Alquiler temporario',
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(price)
  } catch {
    return `${currency} ${price.toLocaleString('es-AR')}`
  }
}

function buildHighlights(property: Property): string[] {
  const out: string[] = []
  if (property.rooms) {
    const parts = [`${property.rooms} ambientes`]
    if (property.bedrooms) parts.push(`${property.bedrooms} dormitorios`)
    out.push(parts.join(' · '))
  }
  if (property.bathrooms) {
    const parts = [`${property.bathrooms} baño${property.bathrooms > 1 ? 's' : ''}`]
    if (property.garages) {
      parts.push(`${property.garages} cochera${property.garages > 1 ? 's' : ''}`)
    }
    out.push(parts.join(' · '))
  }
  if (property.covered_area) {
    const parts = [`${property.covered_area} m² cubiertos`]
    if (property.total_area && property.total_area !== property.covered_area) {
      parts.push(`${property.total_area} m² totales`)
    }
    out.push(parts.join(' · '))
  }
  if (Array.isArray(property.amenities) && property.amenities.length > 0) {
    const amen = (property.amenities as string[]).slice(0, 4).join(' · ')
    out.push(amen)
  }
  if (property.floor != null) {
    out.push(`Piso ${property.floor}`)
  }
  if (out.length === 0) {
    out.push(property.neighborhood)
  }
  return out
}

export interface BuildTourPropsInput {
  property: Property
  brandName?: string
  appUrl?: string
}

export function buildPropertyTourProps(input: BuildTourPropsInput): PropertyTourProps {
  const { property } = input
  const operation = OPERATION_VERB[property.operation_type] ?? 'En venta'
  const type = property.property_type ?? 'Propiedad'
  const typeCap = type.charAt(0).toUpperCase() + type.slice(1)
  const ctaTarget = property.public_slug
    ? `${(input.appUrl ?? 'https://inmodf.com.ar').replace(/\/$/, '')}/p/${property.public_slug}`
    : (input.appUrl ?? 'inmodf.com.ar')

  return {
    title: property.title ?? `${typeCap} en ${property.neighborhood}`,
    subtitle: `${operation} · ${property.neighborhood}, ${property.city}`,
    price: formatPrice(property.asking_price, property.currency),
    highlights: buildHighlights(property),
    photos: (property.photos ?? []).slice(0, 8),
    ctaText: `Más info en ${ctaTarget.replace(/^https?:\/\//, '')}`,
    brandName: input.brandName ?? 'Diego Ferreyra Inmobiliaria',
  }
}
