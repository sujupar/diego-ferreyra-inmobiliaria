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
  const story = [1, 2, 3].filter(i => i < n)
  // Reservamos la última foto para ubicación solo si sobran fotos (>4), para no
  // "robarle" imágenes a la galería en propiedades con pocas fotos.
  const location = n > 4 ? n - 1 : null

  const gallery: number[] = []
  for (let i = 1; i < n; i++) {
    if (!story.includes(i) && i !== location) gallery.push(i)
  }

  return { hero, story, gallery, location }
}
