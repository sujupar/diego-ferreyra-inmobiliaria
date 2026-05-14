/**
 * Templates de copy para anuncios Meta. Sin LLM en este milestone — usamos
 * plantillas determinísticas con los datos de la propiedad. M16 puede
 * augmentarlas con OpenAI para variaciones.
 */
import type { Property } from '../portals/types'

export interface AdCopy {
  primaryText: string
  headline: string
  description: string
}

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

function highlightsLine(property: Property): string {
  const parts: string[] = []
  if (property.rooms) parts.push(`${property.rooms} amb`)
  if (property.bedrooms) parts.push(`${property.bedrooms} dorm`)
  if (property.bathrooms) parts.push(`${property.bathrooms} baño${property.bathrooms > 1 ? 's' : ''}`)
  if (property.garages) parts.push(`${property.garages} cochera${property.garages > 1 ? 's' : ''}`)
  if (property.covered_area) parts.push(`${property.covered_area}m² cub`)
  return parts.join(' · ')
}

function amenitiesLine(property: Property): string {
  if (!Array.isArray(property.amenities)) return ''
  const a = property.amenities as string[]
  if (a.length === 0) return ''
  return a.slice(0, 4).join(' · ')
}

export function buildAdCopy(property: Property): AdCopy {
  const verb = OPERATION_VERB[property.operation_type] ?? 'En venta'
  const type = property.property_type ?? 'propiedad'
  const typeCap = type.charAt(0).toUpperCase() + type.slice(1)
  const price = formatPrice(property.asking_price, property.currency)
  const highlights = highlightsLine(property)
  const amenities = amenitiesLine(property)

  const headline = `${typeCap} en ${property.neighborhood} — ${price}`.slice(0, 40)

  const lines: string[] = []
  lines.push(`${verb} en ${property.neighborhood}`)
  if (highlights) lines.push(`✓ ${highlights}`)
  if (amenities) lines.push(`✓ ${amenities}`)
  lines.push('')
  lines.push('Mirá fotos, video y tour 3D. Coordiná tu visita.')
  const primaryText = lines.join('\n')

  const description = property.description
    ? property.description.slice(0, 100)
    : `${typeCap} ${property.rooms ? `de ${property.rooms} amb ` : ''}en ${property.neighborhood}`.slice(0, 100)

  return { primaryText, headline, description }
}
