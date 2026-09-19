/**
 * Nombres de línea tal como los carga OpenStreetMap en Buenos Aires. Compartido
 * entre el mapa en vivo (`lib/descripcion/zona-mapa.ts`) y el mapa propio
 * (`lib/mapa/overpass-celda.ts`): la misma línea tiene que llamarse igual por los
 * dos caminos.
 */

const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')
/** Más largo que esto no se cita en un aviso: es basura (tags pegados en el nombre) o texto inyectado. */
const MAX_NOMBRE = 120

/**
 * El nombre de un lugar tal como puede llegar al prompt, o null si no sirve.
 * Los nombres los edita cualquiera en OpenStreetMap: se sacan los caracteres de
 * control y se descarta lo que no es un nombre citable. Misma regla en
 * `scripts/mapa-extraer-osm.py` (`nombre_util`).
 */
export function nombreUtil(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null
  const limpio = crudo.replace(CONTROL, '').trim()
  return limpio && limpio.length <= MAX_NOMBRE ? limpio : null
}

/** Subte y tren: "Línea B: Leandro N. Alem → Juan Manuel de Rosas" → "Línea B". */
export function lineaDeRuta(tags: Record<string, unknown>): string | undefined {
  const nombre = typeof tags.name === 'string' ? nombreUtil(tags.name.split(':')[0]) : null
  if (nombre) return nombre
  if (typeof tags.name === 'string' && tags.name.split(':')[0].trim()) return undefined
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
