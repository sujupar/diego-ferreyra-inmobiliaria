import type { Property, ValidationResult } from './types'
import { fotosPublicables, describirDescartadas } from './fotos-publicables'

/**
 * Validación común que aplica a todos los portales antes de publicar.
 * Cada adapter puede agregar reglas específicas (ej. ML exige descripción
 * ≥100 chars, ZonaProp recomienda ≥10 fotos).
 */
export function validateCommon(property: Property): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Una foto que no es un enlace https no se puede publicar en ningún portal.
  // Si además es la única, el aviso saldría sin fotos: se frena acá, con la
  // posición y el motivo, en vez de dejar que el portal conteste "413" o
  // "Multimedia.Url: Valor inválido" (los dos errores reales del 2026-09-14).
  const fotos = fotosPublicables(property.photos)
  if (fotos.validas.length === 0) {
    errors.push(
      fotos.descartadas.length === 0
        ? 'Sin fotos'
        : `${describirDescartadas(fotos.descartadas)}. Volvé a subir las fotos desde Multimedia.`,
    )
  } else if (fotos.descartadas.length > 0) {
    warnings.push(`${describirDescartadas(fotos.descartadas)}: no se va a publicar. Volvé a subirla desde Multimedia.`)
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
