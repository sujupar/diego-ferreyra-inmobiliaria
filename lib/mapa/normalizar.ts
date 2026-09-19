/**
 * Nombres de línea tal como los carga OpenStreetMap en Buenos Aires. Compartido
 * entre el mapa en vivo (`lib/descripcion/zona-mapa.ts`) y el mapa propio
 * (`lib/mapa/overpass-celda.ts`): la misma línea tiene que llamarse igual por los
 * dos caminos.
 */

/** Subte y tren: "Línea B: Leandro N. Alem → Juan Manuel de Rosas" → "Línea B". */
export function lineaDeRuta(tags: Record<string, unknown>): string | undefined {
  const nombre = typeof tags.name === 'string' ? tags.name.split(':')[0].trim() : ''
  if (nombre) return nombre
  return typeof tags.ref === 'string' && tags.ref.trim() ? `Línea ${tags.ref.trim()}` : undefined
}

/** Colectivo, sin ramal: "24-1" → "24", "160AG" → "160"; si no hay ref, del nombre "Línea 105: …". */
export function lineaDeColectivo(tags: Record<string, unknown>): string | undefined {
  const ref = typeof tags.ref === 'string' ? tags.ref.match(/^\d+/)?.[0] : undefined
  const deNombre = typeof tags.name === 'string' ? tags.name.match(/l[ií]nea\s+(\d+)/i)?.[1] : undefined
  const linea = ref ?? deNombre
  return linea ? String(Number(linea)) : undefined
}

export function ordenarLineasColectivo(lineas: Iterable<string>): string[] {
  return [...new Set(lineas)].sort((a, b) => Number(a) - Number(b))
}
