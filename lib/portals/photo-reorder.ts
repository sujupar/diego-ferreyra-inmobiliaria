/**
 * Reordena properties.photos según lo que mandó un wizard SIN perder ni
 * inyectar nada.
 *
 * Por qué existe: el wizard de ML guardaba su selección con slice(0, 12)
 * directo sobre properties.photos — la columna COMPARTIDA. Cada propiedad que
 * pasaba por él quedaba con 12 fotos para siempre: en Argenprop, en la landing
 * y en Meta. La regla ahora es que un wizard elige el ORDEN (portada primero);
 * el conjunto de fotos lo gobierna solo el módulo de media (PATCH /media).
 *
 * - Lo enviado que no pertenece a la propiedad se descarta (anti-inyección,
 *   misma razón que el guard de permutación del PATCH /media).
 * - Lo de la propiedad que falte en lo enviado se apendea al final en su orden
 *   original (anti-pérdida, y tolera un draft viejo si alguien subió fotos con
 *   el wizard abierto).
 */
export function reordenarSinPerder(actuales: string[], enviadas: string[]): string[] {
  const setActuales = new Set(actuales)
  const orden: string[] = []
  const visto = new Set<string>()
  for (const u of enviadas) {
    if (setActuales.has(u) && !visto.has(u)) { orden.push(u); visto.add(u) }
  }
  for (const u of actuales) {
    if (!visto.has(u)) { orden.push(u); visto.add(u) }
  }
  return orden
}
