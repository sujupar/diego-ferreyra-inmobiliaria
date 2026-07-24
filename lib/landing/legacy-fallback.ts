/**
 * E1.2 — Fallback legacy: LandingDocument equivalente al layout hardcodeado
 * histórico de app/p/[slug].
 *
 * Para propiedades SIN fila de landing publicada, /p/[slug] renderiza este
 * documento → la salida es IDÉNTICA a la de antes de E1.2. Cero landings rotas
 * el día del deploy. Cuando el asesor cree/publique la landing (E1.4), la fila
 * publicada reemplaza a este fallback.
 *
 * El orden de bloques replica el page.tsx original: hero → features → gallery →
 * video_embed → tour_3d → description → location_map → lead_form. Se AGREGA
 * proof_bar (prueba social) y video_file (bug del archivo subido) que el layout
 * viejo no tenía — sólo aparecen si hay dato, así que no cambian nada donde no
 * corresponde.
 */
import type { LandingDocument } from './schema'

/**
 * Documento legacy. No depende de la propiedad: los bloques resuelven sus datos
 * en render (los que no aplican devuelven null). El id de cada bloque es estable.
 */
export function legacyFallbackDocument(): LandingDocument {
  return {
    version: 1,
    blocks: [
      { id: 'hero', type: 'hero' },
      { id: 'proof', type: 'proof_bar' },
      { id: 'features', type: 'features' },
      { id: 'gallery', type: 'gallery' },
      { id: 'video_embed', type: 'video_embed' },
      { id: 'video_file', type: 'video_file' },
      { id: 'tour', type: 'tour_3d' },
      { id: 'description', type: 'description' },
      { id: 'map', type: 'location_map' },
      { id: 'form', type: 'lead_form' },
    ],
    theme: {},
  }
}
