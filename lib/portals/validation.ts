import type { Property, ValidationResult } from './types'

/**
 * Validación común que aplica a todos los portales antes de publicar.
 * Cada adapter puede agregar reglas específicas (ej. ML exige descripción
 * ≥100 chars, ZonaProp recomienda ≥10 fotos).
 */
export function validateCommon(property: Property): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!property.photos || property.photos.length === 0) {
    errors.push('Sin fotos')
  }
  if (property.latitude == null || property.longitude == null) {
    errors.push('Falta geolocalización (lat/lng)')
  }
  if (!property.asking_price) errors.push('Sin precio')
  if (!property.address) errors.push('Sin dirección')
  if (!property.property_type) errors.push('Sin tipo de propiedad')

  // Warnings (no bloquean)
  if (!property.description || property.description.length < 100) {
    warnings.push('Falta descripción o es muy corta (<100 chars)')
  }
  if (!property.amenities || (Array.isArray(property.amenities) && property.amenities.length === 0)) {
    warnings.push('Sin amenities')
  }
  if (!property.video_url) warnings.push('Sin video')
  if (!property.tour_3d_url) warnings.push('Sin tour 3D')

  return { ok: errors.length === 0, errors, warnings }
}
