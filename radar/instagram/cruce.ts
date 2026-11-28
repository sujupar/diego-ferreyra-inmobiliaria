// Cruce de la pestaña Reels (vistas, sin fecha) con la grilla o media/info (fecha y texto).
// Puro y probado: es donde se decide qué reel entra y con qué números.

import type { ReelCrudo } from '../tipos'
import type { ReelDePestana } from './parsers'

/**
 * Devuelve los reels en el orden de la pestaña Reels. Un reel sin detalle (sin fecha) queda
 * afuera y se informa en `sinFecha`: nunca se inventa una fecha. Las vistas salen de la
 * pestaña y si no, del detalle; si no hay en ninguno, quedan en null (nunca 0).
 */
export function cruzarReels(
  pestana: ReelDePestana[],
  detalle: Map<string, ReelCrudo>,
  cuenta: string,
): { reels: ReelCrudo[]; sinFecha: string[] } {
  const reels: ReelCrudo[] = []
  const sinFecha: string[] = []
  for (const r of pestana) {
    const d = detalle.get(r.shortcode)
    if (!d) {
      sinFecha.push(r.shortcode)
      continue
    }
    reels.push({
      ...d,
      cuenta,
      vistas: r.vistas ?? d.vistas,
      likes: r.likes ?? d.likes,
      comentarios: r.comentarios ?? d.comentarios,
      urlPortada: d.urlPortada ?? r.urlPortada,
      // Si está en la pestaña Reels, es un reel aunque la grilla lo muestre distinto.
      esReel: true,
    })
  }
  return { reels, sinFecha }
}
