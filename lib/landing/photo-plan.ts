/**
 * E1.9 — Reparto de las fotos de la propiedad entre las secciones de la landing
 * de lujo. Curación determinística + degradación elegante (nunca queda rota con
 * pocas fotos): la 0 es la portada del hero, 1-3 acompañan la historia, la
 * última se reserva para la ubicación si hay margen, y el resto va a la galería.
 */
export interface PhotoPlan {
  /** Índice de la portada (hero). */
  hero: number
  /** Índices para los bloques de historia (0-3). */
  story: number[]
  /** Índices para la galería curada. */
  gallery: number[]
  /** Índice de la foto exterior para ubicación, o null (→ banda navy). */
  location: number | null
}

export function planPhotos(photos: string[]): PhotoPlan {
  const n = photos?.length ?? 0
  if (n === 0) return { hero: 0, story: [], gallery: [], location: null }

  const hero = 0
  // La historia toma 3 highlights curados (con narrativa).
  const story = [1, 2, 3].filter(i => i < n)
  // La galería es el RECORRIDO COMPLETO (todas las fotos, destacada = la portada),
  // como en la referencia. Se muestra desde 3 fotos (con menos, la historia alcanza).
  const gallery = n >= 3 ? Array.from({ length: n }, (_, i) => i) : []
  // Ubicación: SIEMPRE banda navy elegante con el copy de zona. No usamos una foto
  // de la propiedad como "la zona" (una foto interior etiquetada 'Ubicación' es
  // incongruente); si en el futuro hay imágenes de barrio, se enchufan acá.
  const location = null

  return { hero, story, gallery, location }
}
